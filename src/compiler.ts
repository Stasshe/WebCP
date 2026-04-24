import { runProgram } from "./interpreter/interpreter";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import type {
  BlockStmtNode,
  CompileError,
  CompileResult,
  ProgramNode,
  RunResult,
  StatementNode,
} from "./types";

export function compile(source: string): CompileResult {
  const lexed = lex(source);
  if (!lexed.ok) {
    return { ok: false, errors: lexed.errors };
  }
  const parsed = parse(lexed.tokens);
  if (!parsed.ok) {
    return parsed;
  }

  const errors = validateProgram(parsed.program);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return parsed;
}

export function formatCompileErrors(filename: string, errors: CompileError[]): string {
  return errors
    .map((error) => `${filename}:${error.line}:${error.col}: error: ${error.message}`)
    .join("\n");
}

export function runCompiled(program: ProgramNode, input = ""): RunResult {
  return runProgram(program, input);
}

export function formatRuntimeError(errorMessage: string, functionName: string, line: number): string {
  return `Runtime Error: ${errorMessage}\n  at ${functionName}:${line}`;
}

export function compileAndRun(source: string, input = "", filename = "<input>"): RunResult {
  const compiled = compile(source);
  if (!compiled.ok) {
    return {
      status: "error",
      output: { stdout: "", stderr: "" },
      error: {
        message: formatCompileErrors(filename, compiled.errors),
        line: compiled.errors[0]?.line ?? 1,
        functionName: "<compile>",
      },
      debugInfo: {
        currentLine: compiled.errors[0]?.line ?? 1,
        callStack: [],
        localVars: [],
        globalVars: [],
        arrays: [],
        watchList: [],
      },
      stepCount: 0,
    };
  }
  const runResult = runCompiled(compiled.program, input);
  if (runResult.error !== null) {
    return {
      ...runResult,
      error: {
        ...runResult.error,
        message: formatRuntimeError(
          runResult.error.message,
          runResult.error.functionName,
          runResult.error.line,
        ),
      },
    };
  }
  return runResult;
}

function validateProgram(program: ProgramNode): CompileError[] {
  const errors: CompileError[] = [];

  for (const fn of program.functions) {
    validateBlock(fn.body, 0, errors);
  }

  return errors;
}

function validateBlock(block: BlockStmtNode, loopDepth: number, errors: CompileError[]): void {
  for (const stmt of block.statements) {
    validateStatement(stmt, loopDepth, errors);
  }
}

function validateStatement(stmt: StatementNode, loopDepth: number, errors: CompileError[]): void {
  switch (stmt.kind) {
    case "BlockStmt":
      validateBlock(stmt, loopDepth, errors);
      return;
    case "IfStmt":
      for (const branch of stmt.branches) {
        validateBlock(branch.thenBlock, loopDepth, errors);
      }
      if (stmt.elseBlock !== null) {
        validateBlock(stmt.elseBlock, loopDepth, errors);
      }
      return;
    case "WhileStmt":
      validateBlock(stmt.body, loopDepth + 1, errors);
      return;
    case "ForStmt":
      validateBlock(stmt.body, loopDepth + 1, errors);
      return;
    case "BreakStmt":
      if (loopDepth === 0) {
        errors.push({
          line: stmt.line,
          col: stmt.col,
          message: "break statement not within a loop",
        });
      }
      return;
    case "ContinueStmt":
      if (loopDepth === 0) {
        errors.push({
          line: stmt.line,
          col: stmt.col,
          message: "continue statement not within a loop",
        });
      }
      return;
    default:
      return;
  }
}
