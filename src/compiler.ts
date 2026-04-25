import { runProgram } from "./interpreter/interpreter";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { preprocess } from "./preprocessor";
import { validateProgram } from "./semantic/validator";
import type { CompileError, CompileResult, ProgramNode, RunResult } from "./types";

export function compile(source: string): CompileResult {
  const preprocessed = preprocess(source);
  if (!preprocessed.ok) {
    return { ok: false, errors: preprocessed.errors };
  }

  const lexed = lex(preprocessed.source);
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
        input: {
          tokens: input
            .split(/\s+/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0),
          nextIndex: 0,
        },
        executionRange: null,
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
