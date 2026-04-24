import { BreakSignal, ContinueSignal, ReturnSignal, RuntimeTrap } from "../runtime/errors";
import type { RuntimeValue } from "../runtime/value";
import { defaultValueForType, stringifyValue, uninitializedForType } from "../runtime/value";
import type {
  ArrayDeclNode,
  ArrayView,
  AssignTargetNode,
  BinaryExprNode,
  BlockStmtNode,
  DebugState,
  DebugInfo,
  DebugValueView,
  ExprNode,
  FrameView,
  FunctionDeclNode,
  ProgramNode,
  RunResult,
  RuntimeErrorInfo,
  ScopeView,
  StatementNode,
  TypeNode,
  VectorDeclNode,
} from "../types";
import { isPrimitiveType } from "../types";

type Scope = Map<string, RuntimeValue>;
type PrimitiveElementType = "int" | "bool" | "string";

type ArrayStore = {
  elementType: PrimitiveElementType;
  values: RuntimeValue[];
  dynamic: boolean;
};

export type InterpreterStepInfo = {
  line: number;
  callStack: FrameView[];
  kind: "statement" | "expression";
  stepCount: number;
  debugInfo: DebugInfo;
};

export type InterpreterOptions = {
  onStep?: (info: InterpreterStepInfo) => "pause" | void;
};

class PauseTrap {
  readonly stepCount: number;

  readonly reason: "step" | "breakpoint";

  readonly debugInfo: DebugInfo;

  constructor(stepCount: number, reason: "step" | "breakpoint", debugInfo: DebugInfo) {
    this.stepCount = stepCount;
    this.reason = reason;
    this.debugInfo = debugInfo;
  }
}

export function runProgram(
  program: ProgramNode,
  input: string,
  options: InterpreterOptions = {},
): RunResult {
  const runner = new Interpreter(program, input, options);
  return runner.run();
}

class Interpreter {
  private readonly program: ProgramNode;

  private readonly inputTokens: string[];

  private readonly options: InterpreterOptions;

  private inputIndex = 0;

  private readonly globals: Scope = new Map();

  private readonly functions = new Map<string, FunctionDeclNode>();

  private readonly output = { stdout: "", stderr: "" };

  private readonly arrays = new Map<number, ArrayStore>();

  private nextArrayRef = 1;

  private currentFunction = "<global>";

  private currentLine = 1;

  private readonly scopeStack: Scope[] = [];

  private readonly frameStack: FrameView[] = [];

  private stepCount = 0;

  constructor(program: ProgramNode, input: string, options: InterpreterOptions) {
    this.program = program;
    this.options = options;
    this.inputTokens = input
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  run(): RunResult {
    try {
      for (const fn of this.program.functions) {
        if (this.functions.has(fn.name)) {
          this.fail(`redefinition of function '${fn.name}'`, fn.line);
        }
        this.functions.set(fn.name, fn);
      }

      for (const decl of this.program.globals) {
        this.declareGlobal(decl);
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
        debugInfo: this.buildDebugInfo(),
        stepCount: this.stepCount,
      };
    } catch (error) {
      if (error instanceof PauseTrap) {
        return {
          status: "paused",
          output: this.output,
          error: null,
          debugInfo: error.debugInfo,
          stepCount: error.stepCount,
        };
      }
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
          debugInfo: this.buildDebugInfo(),
          stepCount: this.stepCount,
        };
      }
      throw error;
    }
  }

  private declareGlobal(decl: ProgramNode["globals"][number]): void {
    if (decl.kind === "VarDecl") {
      const value =
        decl.initializer === null
          ? defaultValueForType(this.expectPrimitiveType(decl.type, decl.line))
          : this.evaluateExpr(decl.initializer);
      this.globals.set(decl.name, this.assertType(decl.type, value, decl.line));
      return;
    }

    if (decl.kind === "ArrayDecl") {
      this.defineArrayDecl(decl, this.globals);
      return;
    }

    this.defineVectorDecl(decl, this.globals);
  }

  private invokeFunction(fn: FunctionDeclNode, args: RuntimeValue[]): RuntimeValue {
    const previousFunction = this.currentFunction;
    const previousLine = this.currentLine;
    this.currentFunction = fn.name;
    this.currentLine = fn.line;

    this.frameStack.push({ functionName: fn.name, line: fn.line });

    if (fn.params.length !== args.length) {
      this.fail(`too few arguments to function '${fn.name}'`, fn.line);
    }

    this.scopeStack.push(new Map());
    for (let i = 0; i < fn.params.length; i += 1) {
      const param = fn.params[i];
      const arg = args[i];
      if (param === undefined || arg === undefined) {
        this.fail(`too few arguments to function '${fn.name}'`, fn.line);
      }
      this.define(param.name, this.assertType(param.type, arg, param.line));
    }

    try {
      this.executeBlock(fn.body, false);
      this.scopeStack.pop();
      if (this.isVoidType(fn.returnType)) {
        return { kind: "void" };
      }
      return uninitializedForType(this.expectPrimitiveType(fn.returnType, fn.line));
    } catch (signal) {
      this.scopeStack.pop();
      if (signal instanceof ReturnSignal) {
        if (this.isVoidType(fn.returnType)) {
          return { kind: "void" };
        }
        return this.assertType(fn.returnType, signal.value, fn.line);
      }
      throw signal;
    } finally {
      this.frameStack.pop();
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
    this.step(stmt.line, "statement");

    switch (stmt.kind) {
      case "BlockStmt":
        this.executeBlock(stmt, true);
        return;
      case "VarDecl": {
        const value =
          stmt.initializer === null
            ? uninitializedForType(this.expectPrimitiveType(stmt.type, stmt.line))
            : this.assertType(
                stmt.type,
                this.evaluateExpr(stmt.initializer),
                stmt.line,
              );
        this.define(stmt.name, value);
        return;
      }
      case "ArrayDecl":
        this.defineArrayDecl(stmt, this.currentScope());
        return;
      case "VectorDecl":
        this.defineVectorDecl(stmt, this.currentScope());
        return;
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
                ? uninitializedForType(this.expectPrimitiveType(initDecl.type, initDecl.line))
                : this.assertType(
                    initDecl.type,
                    this.evaluateExpr(initDecl.initializer),
                    initDecl.line,
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
        const value =
          stmt.value === null ? ({ kind: "void" } as RuntimeValue) : this.evaluateExpr(stmt.value);
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
          this.output.stdout += stringifyValue(
            this.ensureInitialized(value, valueExpr.line, "value"),
          );
        }
        return;
      case "CerrStmt":
        for (const valueExpr of stmt.values) {
          const value = this.evaluateExpr(valueExpr);
          this.output.stderr += stringifyValue(
            this.ensureInitialized(value, valueExpr.line, "value"),
          );
        }
        return;
      case "CinStmt":
        for (const target of stmt.targets) {
          const token = this.inputTokens[this.inputIndex];
          if (token === undefined) {
            this.fail("input exhausted", stmt.line);
          }
          this.inputIndex += 1;
          this.assignFromInput(target, token, stmt.line);
        }
        return;
    }
  }

  private defineArrayDecl(decl: ArrayDeclNode, scope: Scope): void {
    if (decl.size < 0n) {
      this.fail("array size must be non-negative", decl.line);
    }

    const sizeAsNumber = Number(decl.size);
    const elementType = this.toElementType(decl.type.elementType, decl.line);
    const values = Array.from({ length: sizeAsNumber }, () =>
      decl.initializers.length > 0
        ? this.defaultPrimitiveValue(elementType)
        : this.uninitializedPrimitiveValue(elementType),
    );

    for (let i = 0; i < decl.initializers.length; i += 1) {
      if (i >= values.length) {
        this.fail("too many initializers for array", decl.line);
      }
      const init = decl.initializers[i];
      if (init === undefined) {
        continue;
      }
      values[i] = this.castToElementType(this.evaluateExpr(init), elementType, init.line);
    }

    const arrayValue = this.allocateArray(elementType, false, values);
    this.defineInScope(scope, decl.name, arrayValue, decl.line);
  }

  private defineVectorDecl(decl: VectorDeclNode, scope: Scope): void {
    const elementType = this.toElementType(decl.type.elementType, decl.line);
    const args = decl.constructorArgs.map((arg) => this.evaluateExpr(arg));
    let values: RuntimeValue[] = [];

    if (args.length === 1) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      values = Array.from({ length: Number(size) }, () => this.defaultPrimitiveValue(elementType));
    } else if (args.length === 2) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      const fillValue = this.castToElementType(args[1] as RuntimeValue, elementType, decl.line);
      values = Array.from({ length: Number(size) }, () => fillValue);
    } else if (args.length > 2) {
      this.fail("too many arguments for vector constructor", decl.line);
    }

    const vectorValue = this.allocateArray(elementType, true, values);
    this.defineInScope(scope, decl.name, vectorValue, decl.line);
  }

  private evaluateExpr(expr: ExprNode): RuntimeValue {
    this.step(expr.line, "expression");

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
        if (expr.name === "endl") {
          return { kind: "string", value: "\n" };
        }
        return this.resolve(expr.name, expr.line);
      case "CallExpr": {
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.fail(`'${expr.callee}' was not declared in this scope`, expr.line);
        }
        const argValues = expr.args.map((arg) => this.evaluateExpr(arg));
        return this.invokeFunction(fn, argValues);
      }
      case "MethodCallExpr":
        return this.evaluateMethodCall(expr.receiver, expr.method, expr.args, expr.line);
      case "IndexExpr":
        return this.getIndexedValue(expr.target, expr.index, expr.line);
      case "UnaryExpr": {
        if (expr.operator === "!") {
          const value = this.expectBool(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "bool", value: !value.value };
        }
        if (expr.operator === "-") {
          const value = this.expectInt(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "int", value: -value.value };
        }

        if (expr.operand.kind !== "Identifier" && expr.operand.kind !== "IndexExpr") {
          this.fail("increment/decrement target must be a variable", expr.line);
        }

        const current =
          expr.operand.kind === "Identifier"
            ? this.expectInt(this.resolve(expr.operand.name, expr.line), expr.line)
            : this.expectInt(
                this.getIndexedValue(expr.operand.target, expr.operand.index, expr.line),
                expr.line,
              );
        const delta = expr.operator === "++" ? 1n : -1n;
        const updated: RuntimeValue = { kind: "int", value: current.value + delta };

        if (expr.operand.kind === "Identifier") {
          this.assign(expr.operand.name, updated, expr.line);
        } else {
          this.setIndexedValue(expr.operand.target, expr.operand.index, updated, expr.line);
        }
        return expr.isPostfix ? current : updated;
      }
      case "BinaryExpr":
        return this.evaluateBinary(expr);
      case "AssignExpr": {
        const rightValue = this.ensureInitialized(this.evaluateExpr(expr.value), expr.line, "rhs");
        if (expr.target.kind === "Identifier") {
          const current = this.resolve(expr.target.name, expr.line);
          const assigned = this.resolveAssignedValue(expr.operator, current, rightValue, expr.line);
          this.assign(expr.target.name, assigned, expr.line);
          return assigned;
        }

        let assigned: RuntimeValue = rightValue;
        if (expr.operator !== "=") {
          const currentIndexValue = this.getIndexedValue(
            expr.target.target,
            expr.target.index,
            expr.line,
          );
          assigned = this.resolveAssignedValue(
            expr.operator,
            currentIndexValue,
            rightValue,
            expr.line,
          );
        }
        this.setIndexedValue(expr.target.target, expr.target.index, assigned, expr.line);
        return assigned;
      }
    }
  }

  private resolveAssignedValue(
    operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=",
    current: RuntimeValue,
    rightValue: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (operator === "=") {
      return this.assignWithCurrentType(current, rightValue, line);
    }
    const left = this.expectInt(current, line);
    const right = this.expectInt(rightValue, line);
    return this.applyCompoundAssign(operator, left.value, right.value, line);
  }

  private evaluateMethodCall(
    receiverExpr: ExprNode,
    method: string,
    args: ExprNode[],
    line: number,
  ): RuntimeValue {
    const receiver = this.evaluateExpr(receiverExpr);
    const arrayValue = this.expectArray(receiver, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (!store.dynamic) {
      this.fail(`method '${method}' is not supported for fixed array`, line);
    }

    if (method === "push_back") {
      if (args.length !== 1) {
        this.fail("push_back requires exactly 1 argument", line);
      }
      const value = this.castToElementType(
        this.evaluateExpr(args[0] as ExprNode),
        store.elementType,
        line,
      );
      store.values.push(value);
      return { kind: "void" };
    }

    if (method === "pop_back") {
      if (args.length !== 0) {
        this.fail("pop_back requires no arguments", line);
      }
      if (store.values.length === 0) {
        this.fail("pop_back on empty vector", line);
      }
      store.values.pop();
      return { kind: "void" };
    }

    if (method === "size") {
      if (args.length !== 0) {
        this.fail("size requires no arguments", line);
      }
      return { kind: "int", value: BigInt(store.values.length) };
    }

    if (method === "back") {
      if (args.length !== 0) {
        this.fail("back requires no arguments", line);
      }
      const last = store.values[store.values.length - 1];
      if (last === undefined) {
        this.fail("back on empty vector", line);
      }
      return last;
    }

    if (method === "empty") {
      if (args.length !== 0) {
        this.fail("empty requires no arguments", line);
      }
      return { kind: "bool", value: store.values.length === 0 };
    }

    if (method === "clear") {
      if (args.length !== 0) {
        this.fail("clear requires no arguments", line);
      }
      store.values = [];
      return { kind: "void" };
    }

    if (method === "resize") {
      if (args.length !== 1) {
        this.fail("resize requires exactly 1 argument", line);
      }
      const newSize = this.expectInt(this.evaluateExpr(args[0] as ExprNode), line).value;
      if (newSize < 0n) {
        this.fail("resize size must be non-negative", line);
      }
      const targetSize = Number(newSize);
      if (targetSize < store.values.length) {
        store.values = store.values.slice(0, targetSize);
      } else {
        while (store.values.length < targetSize) {
          store.values.push(this.defaultPrimitiveValue(store.elementType));
        }
      }
      return { kind: "void" };
    }

    this.fail(`unknown vector method '${method}'`, line);
  }

  private getIndexedValue(targetExpr: ExprNode, indexExpr: ExprNode, line: number): RuntimeValue {
    const target = this.expectArray(this.evaluateExpr(targetExpr), line);
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    const store = this.arrays.get(target.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (index < 0n || index >= BigInt(store.values.length)) {
      this.fail(
        `index ${index.toString()} out of range for array of size ${store.values.length}`,
        line,
      );
    }
    const value = store.values[Number(index)];
    if (value === undefined) {
      this.fail("invalid index access", line);
    }
    return this.ensureInitialized(value, line, "array element");
  }

  private setIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    value: RuntimeValue,
    line: number,
  ): void {
    const target = this.expectArray(this.evaluateExpr(targetExpr), line);
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    const store = this.arrays.get(target.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (index < 0n || index >= BigInt(store.values.length)) {
      this.fail(
        `index ${index.toString()} out of range for array of size ${store.values.length}`,
        line,
      );
    }
    const assigned = this.castToElementType(value, store.elementType, line);
    store.values[Number(index)] = assigned;
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
      return {
        kind: "bool",
        value: compareValues(left, right, expr.operator, expr.line, this.fail.bind(this)),
      };
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

  private assignWithCurrentType(
    current: RuntimeValue,
    value: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (current.kind === "uninitialized") {
      if (value.kind !== current.expected) {
        this.fail(`cannot assign '${value.kind}' to '${current.expected}'`, line);
      }
      return value;
    }
    if (current.kind === "array") {
      this.fail("cannot assign to array value directly", line);
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

  private expectArray(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "array" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "array") {
      this.fail("type mismatch: expected array/vector", line);
    }
    return initialized;
  }

  private ensureInitialized(
    value: RuntimeValue,
    line: number,
    name: string,
  ): Exclude<RuntimeValue, { kind: "uninitialized" }> {
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

  private assignFromInput(target: AssignTargetNode, token: string, line: number): void {
    const current = this.readAssignTarget(target, line);
    if (current.kind === "int") {
      this.writeAssignTarget(target, { kind: "int", value: BigInt(token) }, line);
      return;
    }
    if (current.kind === "bool") {
      if (token !== "0" && token !== "1") {
        this.fail(`cannot convert '${token}' to bool`, line);
      }
      this.writeAssignTarget(target, { kind: "bool", value: token === "1" }, line);
      return;
    }
    if (current.kind === "string") {
      this.writeAssignTarget(target, { kind: "string", value: token }, line);
      return;
    }
    if (current.kind === "uninitialized") {
      if (current.expected === "int") {
        this.writeAssignTarget(target, { kind: "int", value: BigInt(token) }, line);
      } else if (current.expected === "bool") {
        if (token !== "0" && token !== "1") {
          this.fail(`cannot convert '${token}' to bool`, line);
        }
        this.writeAssignTarget(target, { kind: "bool", value: token === "1" }, line);
      } else {
        this.writeAssignTarget(target, { kind: "string", value: token }, line);
      }
      return;
    }
    this.fail("invalid cin target", line);
  }

  private readAssignTarget(target: AssignTargetNode, line: number): RuntimeValue {
    if (target.kind === "Identifier") {
      return this.resolve(target.name, line);
    }
    return this.getIndexedValue(target.target, target.index, line);
  }

  private writeAssignTarget(target: AssignTargetNode, value: RuntimeValue, line: number): void {
    if (target.kind === "Identifier") {
      this.assign(target.name, value, line);
      return;
    }
    this.setIndexedValue(target.target, target.index, value, line);
  }

  private allocateArray(
    elementType: PrimitiveElementType,
    dynamic: boolean,
    values: RuntimeValue[],
  ): RuntimeValue {
    const ref = this.nextArrayRef;
    this.nextArrayRef += 1;
    this.arrays.set(ref, { elementType, values, dynamic });
    return { kind: "array", ref, elementType, dynamic };
  }

  private castToElementType(
    value: RuntimeValue,
    typeName: PrimitiveElementType,
    line: number,
  ): RuntimeValue {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== typeName) {
      this.fail(`cannot convert '${initialized.kind}' to '${typeName}'`, line);
    }
    return initialized;
  }

  private defaultPrimitiveValue(typeName: PrimitiveElementType): RuntimeValue {
    if (typeName === "int") {
      return { kind: "int", value: 0n };
    }
    if (typeName === "bool") {
      return { kind: "bool", value: false };
    }
    return { kind: "string", value: "" };
  }

  private uninitializedPrimitiveValue(typeName: PrimitiveElementType): RuntimeValue {
    return { kind: "uninitialized", expected: typeName };
  }

  private defineInScope(scope: Scope, name: string, value: RuntimeValue, line: number): void {
    if (scope.has(name)) {
      this.fail(`redefinition of '${name}'`, line);
    }
    scope.set(name, value);
  }

  private define(name: string, value: RuntimeValue): void {
    this.defineInScope(this.currentScope(), name, value, this.currentLine);
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
        const current = scope.get(name);
        if (current !== undefined) {
          scope.set(name, this.assignWithCurrentType(current, value, line));
          return;
        }
      }
    }

    if (this.globals.has(name)) {
      const current = this.globals.get(name);
      if (current !== undefined) {
        this.globals.set(name, this.assignWithCurrentType(current, value, line));
        return;
      }
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  private assertPrimitiveType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    const normalizedType = this.normalizePrimitiveType(type, line);
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

  private assertType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    if (isPrimitiveType(type)) {
      return this.assertPrimitiveType(type, value, line);
    }

    if (value.kind !== "array") {
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (value.elementType !== this.toElementType(type.elementType, line)) {
      this.fail(`cannot convert '${value.elementType}' to '${type.elementType.name}'`, line);
    }

    if (type.kind === "VectorType" && !value.dynamic) {
      this.fail("cannot convert 'array' to 'vector'", line);
    }

    if (type.kind === "ArrayType" && value.dynamic) {
      this.fail("cannot convert 'vector' to 'array'", line);
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

  private step(line: number, kind: "statement" | "expression"): void {
    this.stepCount += 1;
    this.currentLine = line;
    const top = this.frameStack[this.frameStack.length - 1];
    if (top !== undefined) {
      top.line = line;
    }
    const debugInfo = this.buildDebugInfo();
    const action = this.options.onStep?.({
      line,
      kind,
      stepCount: this.stepCount,
      callStack: this.frameStack.map((frame) => ({
        functionName: frame.functionName,
        line: frame.line,
      })),
      debugInfo,
    });
    if (action === "pause") {
      throw new PauseTrap(this.stepCount, "step", debugInfo);
    }
  }

  private fail(message: string, line: number): never {
    throw new RuntimeTrap(message, this.currentFunction, line);
  }

  private toElementType(type: TypeNode, line: number): PrimitiveElementType {
    const typeName = this.normalizePrimitiveType(type, line);
    if (typeName === "int" || typeName === "long long") {
      return "int";
    }
    if (typeName === "bool") {
      return "bool";
    }
    if (typeName === "string") {
      return "string";
    }
    this.fail("element type cannot be void", line);
  }

  private expectPrimitiveType(type: TypeNode, line: number): Extract<TypeNode, { kind: "PrimitiveType" }> {
    if (!isPrimitiveType(type)) {
      this.fail(`expected primitive type, got '${this.typeKindName(type)}'`, line);
    }
    return type;
  }

  private isVoidType(type: TypeNode): boolean {
    return isPrimitiveType(type) && type.name === "void";
  }

  private normalizePrimitiveType(type: TypeNode, line: number): "int" | "long long" | "bool" | "string" | "void" {
    const primitive = this.expectPrimitiveType(type, line);
    return primitive.name;
  }

  private typeKindName(type: TypeNode): string {
    switch (type.kind) {
      case "PrimitiveType":
        return type.name;
      case "ArrayType":
        return "array";
      case "VectorType":
        return "vector";
    }
  }

  private buildDebugInfo(): DebugInfo {
    return {
      currentLine: this.currentLine,
      callStack: this.frameStack.map((frame) => ({
        functionName: frame.functionName,
        line: frame.line,
      })),
      localVars: this.scopeStack.map((scope, index) => ({
        name: `scope#${index}`,
        vars: this.serializeScope(scope),
      })),
      globalVars: this.serializeScope(this.globals),
      arrays: Array.from(this.arrays.entries()).map(([ref, store]) => ({
        ref,
        elementType: store.elementType,
        dynamic: store.dynamic,
        values: store.values.map((value) => this.serializeValue(value)),
      })),
      watchList: [],
    };
  }

  private serializeScope(scope: Scope): DebugValueView[] {
    return Array.from(scope.entries())
      .map(([name, value]) => this.serializeNamedValue(name, value))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private serializeNamedValue(name: string, value: RuntimeValue): DebugValueView {
    return {
      name,
      kind: value.kind,
      value: this.serializeValue(value),
    };
  }

  private serializeValue(value: RuntimeValue): string {
    switch (value.kind) {
      case "array":
        return `<${value.dynamic ? "vector" : "array"}#${value.ref}>`;
      case "uninitialized":
        return `<uninitialized:${value.expected}>`;
      default:
        return stringifyValue(value);
    }
  }
}

export function buildDebugState(
  result: RunResult,
  pauseReason: "step" | "breakpoint" | null,
  stepCount: number,
): DebugState {
  return {
    status:
      result.status === "done" ? "done" : result.status === "paused" ? "paused" : "error",
    currentLine: result.debugInfo.currentLine,
    callStack: result.debugInfo.callStack,
    output: result.output,
    error: result.error,
    localVars: result.debugInfo.localVars,
    globalVars: result.debugInfo.globalVars,
    arrays: result.debugInfo.arrays,
    watchList: result.debugInfo.watchList,
    stepCount,
    pauseReason,
  };
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
      return comparePrimitive(
        left.value,
        (right as { kind: "int"; value: bigint }).value,
        operator,
      );
    case "bool":
      return comparePrimitive(
        left.value,
        (right as { kind: "bool"; value: boolean }).value,
        operator,
      );
    case "string":
      return comparePrimitive(
        left.value,
        (right as { kind: "string"; value: string }).value,
        operator,
      );
    case "array":
      fail("array comparison is not supported", line);
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
