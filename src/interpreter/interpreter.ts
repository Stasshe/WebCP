import { BreakSignal, ContinueSignal, ReturnSignal, RuntimeTrap } from "../runtime/errors";
import { defaultValueForType, stringifyValue, uninitializedForType } from "../runtime/value";
import type {
  BinaryExprNode,
  BlockStmtNode,
  ExprNode,
  FunctionDeclNode,
  PrimitiveTypeName,
  ProgramNode,
  RunResult,
  RuntimeErrorInfo,
  StatementNode,
} from "../types";
import type { RuntimeValue } from "../runtime/value";

type Scope = Map<string, RuntimeValue>;

export function runProgram(program: ProgramNode, input: string): RunResult {
  const runner = new Interpreter(program, input);
  return runner.run();
}

class Interpreter {
  private readonly program: ProgramNode;

  private readonly inputTokens: string[];

  private inputIndex = 0;

  private readonly globals: Scope = new Map();

  private readonly functions = new Map<string, FunctionDeclNode>();

  private readonly output = { stdout: "", stderr: "" };

  private currentFunction = "<global>";

  private currentLine = 1;

  private readonly scopeStack: Scope[] = [];

  constructor(program: ProgramNode, input: string) {
    this.program = program;
    this.inputTokens = input
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  run(): RunResult {
    try {
      for (const fn of this.program.functions) {
        if (this.functions.has(fn.name)) {
          this.fail(`function '${fn.name}' redefinition`, fn.line);
        }
        this.functions.set(fn.name, fn);
      }

      for (const globalDecl of this.program.globals) {
        const value =
          globalDecl.initializer === null
            ? defaultValueForType(globalDecl.typeName)
            : this.evaluateExpr(globalDecl.initializer);
        this.globals.set(globalDecl.name, this.assertType(globalDecl.typeName, value, globalDecl.line));
      }

      const main = this.functions.get("main");
      if (main === undefined) {
        this.fail("'main' function is required", 1);
      }

      this.invokeFunction(main, []);
      return {
        status: "done",
        output: this.output,
        error: null,
      };
    } catch (error) {
      if (error instanceof RuntimeTrap) {
        const runtimeError: RuntimeErrorInfo = {
          message: error.message,
          line: error.line,
          functionName: error.functionName,
        };
        return {
          status: "error",
          output: this.output,
          error: runtimeError,
        };
      }
      throw error;
    }
  }

  private invokeFunction(fn: FunctionDeclNode, args: RuntimeValue[]): RuntimeValue {
    const previousFunction = this.currentFunction;
    const previousLine = this.currentLine;
    this.currentFunction = fn.name;
    this.currentLine = fn.line;

    if (fn.params.length !== args.length) {
      this.fail(`argument count mismatch for function '${fn.name}'`, fn.line);
    }

    this.scopeStack.push(new Map());
    for (let i = 0; i < fn.params.length; i += 1) {
      const param = fn.params[i];
      if (param === undefined) {
        this.fail("internal parameter error", fn.line);
      }
      const arg = args[i];
      if (arg === undefined) {
        this.fail(`too few arguments to function '${fn.name}'`, fn.line);
      }
      this.define(param.name, this.assertType(param.typeName, arg, param.line));
    }

    try {
      this.executeBlock(fn.body, false);
      this.scopeStack.pop();
      if (fn.returnType === "void") {
        return { kind: "void" };
      }
      return uninitializedForType(fn.returnType);
    } catch (signal) {
      this.scopeStack.pop();
      if (signal instanceof ReturnSignal) {
        if (fn.returnType === "void") {
          return { kind: "void" };
        }
        return this.assertType(fn.returnType, signal.value, fn.line);
      }
      throw signal;
    } finally {
      this.currentFunction = previousFunction;
      this.currentLine = previousLine;
    }
  }

  private executeBlock(block: BlockStmtNode, createScope: boolean): void {
    if (createScope) {
      this.scopeStack.push(new Map());
    }
    try {
      for (const stmt of block.statements) {
        this.executeStatement(stmt);
      }
    } finally {
      if (createScope) {
        this.scopeStack.pop();
      }
    }
  }

  private executeStatement(stmt: StatementNode): void {
    this.currentLine = stmt.line;
    switch (stmt.kind) {
      case "BlockStmt":
        this.executeBlock(stmt, true);
        return;
      case "VarDecl": {
        const value =
          stmt.initializer === null
            ? uninitializedForType(stmt.typeName)
            : this.assertType(stmt.typeName, this.evaluateExpr(stmt.initializer), stmt.line);
        this.define(stmt.name, value);
        return;
      }
      case "IfStmt": {
        for (const branch of stmt.branches) {
          const condition = this.evaluateExpr(branch.condition);
          if (this.expectBool(condition, branch.condition.line).value) {
            this.executeBlock(branch.thenBlock, true);
            return;
          }
        }
        if (stmt.elseBlock !== null) {
          this.executeBlock(stmt.elseBlock, true);
        }
        return;
      }
      case "WhileStmt": {
        while (this.expectBool(this.evaluateExpr(stmt.condition), stmt.condition.line).value) {
          try {
            this.executeBlock(stmt.body, true);
          } catch (signal) {
            if (signal instanceof ContinueSignal) {
              continue;
            }
            if (signal instanceof BreakSignal) {
              break;
            }
            throw signal;
          }
        }
        return;
      }
      case "ForStmt": {
        this.scopeStack.push(new Map());
        try {
          if (stmt.init.kind === "varDecl") {
            const initDecl = stmt.init.value;
            const value =
              initDecl.initializer === null
                ? uninitializedForType(initDecl.typeName)
                : this.assertType(
                    initDecl.typeName,
                    this.evaluateExpr(initDecl.initializer),
                    initDecl.initializer.line,
                  );
            this.define(initDecl.name, value);
          } else if (stmt.init.kind === "expr") {
            this.evaluateExpr(stmt.init.value);
          }

          while (
            stmt.condition === null ||
            this.expectBool(this.evaluateExpr(stmt.condition), stmt.line).value
          ) {
            try {
              this.executeBlock(stmt.body, true);
            } catch (signal) {
              if (signal instanceof ContinueSignal) {
                if (stmt.update !== null) {
                  this.evaluateExpr(stmt.update);
                }
                continue;
              }
              if (signal instanceof BreakSignal) {
                break;
              }
              throw signal;
            }

            if (stmt.update !== null) {
              this.evaluateExpr(stmt.update);
            }
          }
        } finally {
          this.scopeStack.pop();
        }
        return;
      }
      case "ReturnStmt": {
        const value = stmt.value === null ? { kind: "void" as const } : this.evaluateExpr(stmt.value);
        throw new ReturnSignal(value);
      }
      case "BreakStmt":
        throw new BreakSignal();
      case "ContinueStmt":
        throw new ContinueSignal();
      case "ExprStmt":
        this.evaluateExpr(stmt.expression);
        return;
      case "CoutStmt":
        for (const valueExpr of stmt.values) {
          const value = this.evaluateExpr(valueExpr);
          this.output.stdout += stringifyValue(this.ensureInitialized(value, valueExpr.line, "value"));
        }
        return;
      case "CerrStmt":
        for (const valueExpr of stmt.values) {
          const value = this.evaluateExpr(valueExpr);
          this.output.stderr += stringifyValue(this.ensureInitialized(value, valueExpr.line, "value"));
        }
        return;
      case "CinStmt":
        for (const target of stmt.targets) {
          const token = this.inputTokens[this.inputIndex];
          if (token === undefined) {
            this.fail("input exhausted", stmt.line);
          }
          this.inputIndex += 1;
          const current = this.resolve(target.name, target.line);
          if (current.kind === "int") {
            this.assign(target.name, { kind: "int", value: BigInt(token) }, target.line);
          } else if (current.kind === "bool") {
            if (token !== "0" && token !== "1") {
              this.fail(`cannot convert '${token}' to bool`, target.line);
            }
            this.assign(target.name, { kind: "bool", value: token === "1" }, target.line);
          } else if (current.kind === "string") {
            this.assign(target.name, { kind: "string", value: token }, target.line);
          } else if (current.kind === "uninitialized") {
            if (current.expected === "int") {
              this.assign(target.name, { kind: "int", value: BigInt(token) }, target.line);
            } else if (current.expected === "bool") {
              if (token !== "0" && token !== "1") {
                this.fail(`cannot convert '${token}' to bool`, target.line);
              }
              this.assign(target.name, { kind: "bool", value: token === "1" }, target.line);
            } else {
              this.assign(target.name, { kind: "string", value: token }, target.line);
            }
          } else {
            this.fail("invalid cin target", target.line);
          }
        }
        return;
    }
  }

  private evaluateExpr(expr: ExprNode): RuntimeValue {
    this.currentLine = expr.line;
    switch (expr.kind) {
      case "Literal":
        if (expr.valueType === "int") {
          return { kind: "int", value: expr.value as bigint };
        }
        if (expr.valueType === "bool") {
          return { kind: "bool", value: expr.value as boolean };
        }
        return { kind: "string", value: expr.value as string };
      case "Identifier":
        return this.resolve(expr.name, expr.line);
      case "CallExpr": {
        if (expr.callee === "endl") {
          return { kind: "string", value: "\n" };
        }
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.fail(`'${expr.callee}' was not declared in this scope`, expr.line);
        }
        const argValues = expr.args.map((arg) => this.evaluateExpr(arg));
        return this.invokeFunction(fn, argValues);
      }
      case "UnaryExpr": {
        if (expr.operator === "!") {
          const value = this.expectBool(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "bool", value: !value.value };
        }
        if (expr.operator === "-") {
          const value = this.expectInt(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "int", value: -value.value };
        }
        if (expr.operand.kind !== "Identifier") {
          this.fail("increment/decrement target must be a variable", expr.line);
        }
        const current = this.expectInt(this.resolve(expr.operand.name, expr.line), expr.line);
        const delta = expr.operator === "++" ? 1n : -1n;
        const updated = { kind: "int" as const, value: current.value + delta };
        this.assign(expr.operand.name, updated, expr.line);
        return expr.isPostfix ? current : updated;
      }
      case "BinaryExpr":
        return this.evaluateBinary(expr);
      case "AssignExpr": {
        const current = this.resolve(expr.target.name, expr.line);
        const rightValue = this.ensureInitialized(this.evaluateExpr(expr.value), expr.line, expr.target.name);

        if (expr.operator === "=") {
          const assigned = this.assignWithCurrentType(current, rightValue, expr.line);
          this.assign(expr.target.name, assigned, expr.line);
          return assigned;
        }

        const left = this.expectInt(current, expr.line);
        const right = this.expectInt(rightValue, expr.line);
        const assigned = this.applyCompoundAssign(expr.operator, left.value, right.value, expr.line);
        this.assign(expr.target.name, assigned, expr.line);
        return assigned;
      }
    }
  }

  private evaluateBinary(expr: BinaryExprNode): RuntimeValue {
    if (expr.operator === "&&") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (!left.value) {
        return { kind: "bool", value: false };
      }
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    if (expr.operator === "||") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (left.value) {
        return { kind: "bool", value: true };
      }
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    const left = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.left), expr.line, "left operand"),
      expr.line,
    );
    const right = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.right), expr.line, "right operand"),
      expr.line,
    );

    if (expr.operator === "+" && left.kind === "string" && right.kind === "string") {
      return { kind: "string", value: left.value + right.value };
    }

    if (
      expr.operator === "==" ||
      expr.operator === "!=" ||
      expr.operator === "<" ||
      expr.operator === "<=" ||
      expr.operator === ">" ||
      expr.operator === ">="
    ) {
      return { kind: "bool", value: compareValues(left, right, expr.operator, expr.line, this.fail.bind(this)) };
    }

    const leftInt = this.expectInt(left, expr.line);
    const rightInt = this.expectInt(right, expr.line);

    switch (expr.operator) {
      case "+":
        return { kind: "int", value: leftInt.value + rightInt.value };
      case "-":
        return { kind: "int", value: leftInt.value - rightInt.value };
      case "*":
        return { kind: "int", value: leftInt.value * rightInt.value };
      case "/":
        if (rightInt.value === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: leftInt.value / rightInt.value };
      case "%":
        if (rightInt.value === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: leftInt.value % rightInt.value };
      default:
        this.fail(`unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private applyCompoundAssign(
    operator: "+=" | "-=" | "*=" | "/=" | "%=",
    left: bigint,
    right: bigint,
    line: number,
  ): RuntimeValue {
    switch (operator) {
      case "+=":
        return { kind: "int", value: left + right };
      case "-=":
        return { kind: "int", value: left - right };
      case "*=":
        return { kind: "int", value: left * right };
      case "/=":
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left / right };
      case "%=":
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left % right };
    }
  }

  private assignWithCurrentType(current: RuntimeValue, value: RuntimeValue, line: number): RuntimeValue {
    if (current.kind === "uninitialized") {
      if (value.kind !== current.expected) {
        this.fail(`cannot assign '${value.kind}' to '${current.expected}'`, line);
      }
      return value;
    }
    if (current.kind !== value.kind) {
      this.fail(`cannot assign '${value.kind}' to '${current.kind}'`, line);
    }
    return value;
  }

  private expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "int") {
      this.fail("type mismatch: expected int", line);
    }
    return initialized;
  }

  private expectBool(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "bool" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "bool") {
      this.fail("type mismatch: expected bool", line);
    }
    return initialized;
  }

  private ensureInitialized(value: RuntimeValue, line: number, name: string): Exclude<RuntimeValue, { kind: "uninitialized" }> {
    if (value.kind === "uninitialized") {
      this.fail(`use of uninitialized variable '${name}'`, line);
    }
    return value;
  }

  private ensureNotVoid(
    value: Exclude<RuntimeValue, { kind: "uninitialized" }>,
    line: number,
  ): Exclude<RuntimeValue, { kind: "void" | "uninitialized" }> {
    if (value.kind === "void") {
      this.fail("void value is not allowed in expression", line);
    }
    return value;
  }

  private define(name: string, value: RuntimeValue): void {
    const scope = this.currentScope();
    if (scope.has(name)) {
      this.fail(`redefinition of '${name}'`, this.currentLine);
    }
    scope.set(name, value);
  }

  private resolve(name: string, line: number): RuntimeValue {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      const found = scope.get(name);
      if (found !== undefined) {
        return found;
      }
    }

    const globalValue = this.globals.get(name);
    if (globalValue !== undefined) {
      return globalValue;
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  private assign(name: string, value: RuntimeValue, line: number): void {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      if (scope.has(name)) {
        scope.set(name, value);
        return;
      }
    }

    if (this.globals.has(name)) {
      this.globals.set(name, value);
      return;
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  private assertType(typeName: PrimitiveTypeName, value: RuntimeValue, line: number): RuntimeValue {
    const normalizedType = typeName === "long long" ? "int" : typeName;
    if (normalizedType === "void") {
      return { kind: "void" };
    }

    if (value.kind === "uninitialized") {
      if (value.expected !== normalizedType) {
        this.fail(`cannot convert '${value.expected}' to '${normalizedType}'`, line);
      }
      return value;
    }

    if (value.kind !== normalizedType) {
      this.fail(`cannot convert '${value.kind}' to '${normalizedType}'`, line);
    }

    return value;
  }

  private currentScope(): Scope {
    const scope = this.scopeStack[this.scopeStack.length - 1];
    if (scope === undefined) {
      this.fail("internal scope error", this.currentLine);
    }
    return scope;
  }

  private fail(message: string, line: number): never {
    throw new RuntimeTrap(message, this.currentFunction, line);
  }
}

function compareValues(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
  line: number,
  fail: (message: string, line: number) => never,
): boolean {
  if (left.kind !== right.kind) {
    fail("type mismatch in comparison", line);
  }

  switch (left.kind) {
    case "int":
      return comparePrimitive(left.value, (right as { kind: "int"; value: bigint }).value, operator);
    case "bool":
      return comparePrimitive(left.value, (right as { kind: "bool"; value: boolean }).value, operator);
    case "string":
      return comparePrimitive(left.value, (right as { kind: "string"; value: string }).value, operator);
  }
}

function comparePrimitive<T extends bigint | boolean | string>(
  left: T,
  right: T,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}
