import { BreakSignal, ContinueSignal, ReturnSignal, RuntimeTrap } from "@/runtime/errors";
import type { RuntimeValue } from "@/runtime/value";
import { stringifyValue, uninitializedForType } from "@/runtime/value";
import { mapKeyType, mapValueType, vectorElementType } from "@/stdlib/template-types";
import type {
  DebugInfo,
  DebugState,
  ExprNode,
  FunctionDeclNode,
  ProgramNode,
  RangeForStmtNode,
  RunResult,
  RuntimeErrorInfo,
  StatementNode,
  TemplateFunctionDeclNode,
} from "@/types";
import { isVectorType, pairType } from "@/types";
import type { RuntimeArgument } from "./evaluator";
import { InterpreterEvaluator } from "./evaluator";
import { buildDebugInfoView, type InterpreterOptions, PauseTrap, toRuntimeError } from "./runtime";

export type { InterpreterOptions, InterpreterStepInfo } from "./runtime";

export function runProgram(
  program: ProgramNode,
  input: string,
  options: InterpreterOptions = {},
): RunResult {
  const runner = new Interpreter(program, input, options);
  return runner.run();
}

class Interpreter extends InterpreterEvaluator {
  private finalDebugInfo: DebugInfo | null = null;

  run(): RunResult {
    try {
      for (const fn of this.program.functions) {
        if (this.functions.has(fn.name) || this.templateFunctions.has(fn.name)) {
          this.fail(`redefinition of function '${fn.name}'`, fn.line);
        }
        if (fn.kind === "TemplateFunctionDecl") {
          this.templateFunctions.set(fn.name, fn);
        } else {
          this.functions.set(fn.name, fn);
        }
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
        debugInfo: this.finalDebugInfo ?? this.buildDebugInfo(),
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
        const runtimeError: RuntimeErrorInfo = toRuntimeError(error);
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

  protected invokeFunction(fn: FunctionDeclNode, args: RuntimeArgument[]): RuntimeValue {
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
      if (param.type.kind === "ReferenceType") {
        if (arg.kind !== "reference") {
          this.fail("reference argument must be an lvalue", param.line);
        }
        this.define(param.name, { kind: "reference", type: param.type, target: arg.target });
        continue;
      }
      if (arg.kind !== "value") {
        this.fail("invalid argument binding", param.line);
      }
      this.define(param.name, this.assertType(param.type, arg.value, param.line));
    }

    try {
      this.executeBlock(fn.body, false);
      this.captureFinalDebugInfo(fn.name);
      this.scopeStack.pop();
      if (this.isVoidType(fn.returnType)) {
        return { kind: "void" };
      }
      return this.defaultValueForDeclaredType(fn.returnType, false, fn.line);
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        this.captureFinalDebugInfo(fn.name);
      }
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

  private declareGlobal(decl: ProgramNode["globals"][number]): void {
    if (decl.kind === "VarDecl") {
      const value =
        decl.initializer === null
          ? this.defaultValueForDeclaredType(decl.type, true, decl.line)
          : this.initializeDeclaredValue(decl.type, decl.initializer, decl.line);
      this.globals.set(decl.name, this.assertType(decl.type, value, decl.line));
      return;
    }

    if (decl.kind === "ArrayDecl") {
      this.defineArrayDecl(decl, this.globals);
      return;
    }

    this.defineVectorDecl(decl, this.globals);
  }

  private executeBlock(block: { statements: StatementNode[] }, createScope: boolean): void {
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
    this.step(stmt, "statement");

    switch (stmt.kind) {
      case "BlockStmt":
        this.executeBlock(stmt, true);
        return;
      case "DeclGroupStmt":
        for (const decl of stmt.declarations) {
          this.executeStatement(decl);
        }
        return;
      case "VarDecl": {
        const value =
          stmt.initializer === null
            ? this.defaultValueForDeclaredType(stmt.type, false, stmt.line)
            : this.initializeDeclaredValue(stmt.type, stmt.initializer, stmt.line);
        this.define(stmt.name, value);
        return;
      }
      case "ArrayDecl":
        this.defineArrayDecl(stmt, this.currentScope());
        return;
      case "VectorDecl":
        this.defineVectorDecl(stmt, this.currentScope());
        return;
      case "RangeForStmt":
        this.executeRangeFor(stmt);
        return;
      case "IfStmt":
        for (const branch of stmt.branches) {
          const condition = this.evaluateExpr(branch.condition);
          if (this.evaluateCondition(condition, branch.condition.line)) {
            this.executeBlock(branch.thenBlock, true);
            return;
          }
        }
        if (stmt.elseBlock !== null) {
          this.executeBlock(stmt.elseBlock, true);
        }
        return;
      case "WhileStmt":
        while (this.evaluateCondition(this.evaluateExpr(stmt.condition), stmt.condition.line)) {
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
      case "ForStmt":
        this.scopeStack.push(new Map());
        try {
          if (stmt.init.kind === "varDecl") {
            const initDecl = stmt.init.value;
            const value =
              initDecl.initializer === null
                ? this.defaultValueForDeclaredType(initDecl.type, false, initDecl.line)
                : this.initializeDeclaredValue(initDecl.type, initDecl.initializer, initDecl.line);
            this.define(initDecl.name, value);
          } else if (stmt.init.kind === "declGroup") {
            for (const initDecl of stmt.init.value) {
              const value =
                initDecl.initializer === null
                  ? this.defaultValueForDeclaredType(initDecl.type, false, initDecl.line)
                  : this.initializeDeclaredValue(
                      initDecl.type,
                      initDecl.initializer,
                      initDecl.line,
                    );
              this.define(initDecl.name, value);
            }
          } else if (stmt.init.kind === "expr") {
            this.evaluateExpr(stmt.init.value);
          }

          while (
            stmt.condition === null ||
            this.evaluateCondition(this.evaluateExpr(stmt.condition), stmt.line)
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
          this.step(target, "expression");
        }
        return;
    }
  }

  protected buildDebugInfo() {
    return buildDebugInfoView(
      this.currentLine,
      this.currentExecutionRange,
      this.frameStack,
      this.scopeStack,
      this.globals,
      this.arrays,
      this.inputTokens,
      this.inputIndex,
      this.serializeScope.bind(this),
      this.serializeValue.bind(this),
    );
  }

  private captureFinalDebugInfo(functionName: string): void {
    // Run-to-end should show the program's final live state.
    // After a normal function returns its frame is gone, so preserving it would
    // show stale locals. main is the only intentional exception because program
    // termination is defined by main finishing.
    if (functionName !== "main") {
      return;
    }
    this.finalDebugInfo = this.buildDebugInfo();
  }

  private executeRangeFor(stmt: RangeForStmtNode): void {
    const iterable = this.getRangeForIterable(stmt.source, stmt.line);
    for (const reference of iterable) {
      this.scopeStack.push(new Map());
      try {
        if (stmt.itemByReference) {
          this.define(stmt.itemName, reference);
        } else {
          const value = this.readLocation(reference.target, stmt.line);
          this.define(
            stmt.itemName,
            stmt.itemType === null ? value : this.assertType(stmt.itemType, value, stmt.line),
          );
        }
        try {
          this.executeBlock(stmt.body, false);
        } catch (signal) {
          if (signal instanceof ContinueSignal) {
            continue;
          }
          if (signal instanceof BreakSignal) {
            break;
          }
          throw signal;
        }
      } finally {
        this.scopeStack.pop();
      }
    }
  }

  private getRangeForIterable(
    source: ExprNode,
    line: number,
  ): Array<Extract<RuntimeValue, { kind: "reference" }>> {
    const value = this.ensureInitialized(this.evaluateExpr(source), line, "value");
    if (value.kind === "array" && isVectorType(value.type)) {
      const elementType = vectorElementType(value.type);
      const store = this.arrays.get(value.ref);
      if (store === undefined) {
        this.fail("invalid array reference", line);
      }
      return store.values.map((_entry, index) => ({
        kind: "reference",
        type: { kind: "ReferenceType", referredType: elementType },
        target: { kind: "array", ref: value.ref, index, type: elementType },
      }));
    }
    if (value.kind === "array") {
      const store = this.arrays.get(value.ref);
      if (store === undefined) {
        this.fail("invalid array reference", line);
      }
      const elementType = isVectorType(store.type)
        ? vectorElementType(store.type)
        : store.type.elementType;
      return store.values.map((_entry, index) => ({
        kind: "reference",
        type: { kind: "ReferenceType", referredType: elementType },
        target: { kind: "array", ref: value.ref, index, type: elementType },
      }));
    }
    if (value.kind === "map") {
      if (
        source.kind !== "Identifier" &&
        source.kind !== "IndexExpr" &&
        source.kind !== "DerefExpr"
      ) {
        this.fail("range-based for over map requires an assignable source", line);
      }
      const parent = this.resolveAssignTargetLocation(source, line);
      return value.entries.map((_entry, entryIndex) => ({
        kind: "reference",
        type: {
          kind: "ReferenceType",
          referredType: pairType(mapKeyType(value.type), mapValueType(value.type)),
        },
        target: {
          kind: "map",
          parent,
          entryIndex,
          type: pairType(mapKeyType(value.type), mapValueType(value.type)),
          access: "entry",
        },
      }));
    }
    if (value.kind === "string") {
      if (
        source.kind !== "Identifier" &&
        source.kind !== "IndexExpr" &&
        source.kind !== "DerefExpr"
      ) {
        this.fail("range-based for over string requires an assignable source", line);
      }
      const parent = this.resolveAssignTargetLocation(source, line);
      return Array.from({ length: value.value.length }, (_unused, index) => ({
        kind: "reference",
        type: { kind: "ReferenceType", referredType: { kind: "PrimitiveType", name: "char" } },
        target: { kind: "string", parent, index },
      }));
    }
    this.fail("range-based for requires array, vector, map, or string", line);
  }

  private defaultValueForDeclaredType(
    type: FunctionDeclNode["returnType"],
    global: boolean,
    line: number,
  ): RuntimeValue {
    if (type.kind === "ReferenceType") {
      this.fail("reference variable must be initialized", line);
    }
    if (global) {
      return this.defaultValueForType(type, line);
    }
    if (type.kind === "PointerType") {
      return { kind: "uninitialized", expectedType: type };
    }
    if (type.kind !== "PrimitiveType") {
      return this.defaultValueForType(type, line);
    }
    return uninitializedForType(type);
  }

  private initializeDeclaredValue(
    type: FunctionDeclNode["returnType"],
    initializer: ExprNode,
    line: number,
  ): RuntimeValue {
    if (type.kind === "ReferenceType") {
      if (
        initializer.kind !== "Identifier" &&
        initializer.kind !== "IndexExpr" &&
        initializer.kind !== "DerefExpr"
      ) {
        this.fail("reference initializer must be an lvalue", line);
      }
      return {
        kind: "reference",
        type,
        target: this.resolveAssignTargetLocation(initializer, line),
      };
    }
    return this.assertType(type, this.evaluateExpr(initializer), line);
  }
}

export function buildDebugState(
  result: RunResult,
  pauseReason: "step" | "breakpoint" | null,
  stepCount: number,
): DebugState {
  return {
    status: result.status === "done" ? "done" : result.status === "paused" ? "paused" : "error",
    currentLine: result.debugInfo.currentLine,
    callStack: result.debugInfo.callStack,
    output: result.output,
    error: result.error,
    localVars: result.debugInfo.localVars,
    globalVars: result.debugInfo.globalVars,
    arrays: result.debugInfo.arrays,
    watchList: result.debugInfo.watchList,
    input: result.debugInfo.input,
    executionRange: result.debugInfo.executionRange,
    stepCount,
    pauseReason,
  };
}
