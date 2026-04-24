import { BreakSignal, ContinueSignal, ReturnSignal, RuntimeTrap } from "../runtime/errors";
import type { RuntimeValue } from "../runtime/value";
import { defaultValueForType, stringifyValue, uninitializedForType } from "../runtime/value";
import type {
  DebugState,
  FunctionDeclNode,
  ProgramNode,
  RunResult,
  RuntimeErrorInfo,
  StatementNode,
} from "../types";
import { buildDebugInfoView, InterpreterOptions, PauseTrap, toRuntimeError } from "./interpreter-runtime";
import { InterpreterEvaluator } from "./interpreter-evaluator";

export type { InterpreterOptions, InterpreterStepInfo } from "./interpreter-runtime";

export function runProgram(
  program: ProgramNode,
  input: string,
  options: InterpreterOptions = {},
): RunResult {
  const runner = new Interpreter(program, input, options);
  return runner.run();
}

class Interpreter extends InterpreterEvaluator {
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

  protected invokeFunction(fn: FunctionDeclNode, args: RuntimeValue[]): RuntimeValue {
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
    this.step(stmt.line, "statement");

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
      case "IfStmt":
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
      case "WhileStmt":
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
      case "ForStmt":
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
          } else if (stmt.init.kind === "declGroup") {
            for (const initDecl of stmt.init.value) {
              const value =
                initDecl.initializer === null
                  ? uninitializedForType(this.expectPrimitiveType(initDecl.type, initDecl.line))
                  : this.assertType(
                      initDecl.type,
                      this.evaluateExpr(initDecl.initializer),
                      initDecl.line,
                    );
              this.define(initDecl.name, value);
            }
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

  protected buildDebugInfo() {
    return buildDebugInfoView(
      this.currentLine,
      this.frameStack,
      this.scopeStack,
      this.globals,
      this.arrays,
      this.serializeScope.bind(this),
      this.serializeValue.bind(this),
    );
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
