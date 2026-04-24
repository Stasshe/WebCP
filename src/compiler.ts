import { runProgram } from "./interpreter/interpreter";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import type { CompileError, CompileResult, ProgramNode, RunResult } from "./types";

export function compile(source: string): CompileResult {
  const lexed = lex(source);
  if (!lexed.ok) {
    return { ok: false, errors: lexed.errors };
  }
  return parse(lexed.tokens);
}

export function formatCompileErrors(filename: string, errors: CompileError[]): string {
  return errors
    .map((error) => `${filename}:${error.line}:${error.col}: error: ${error.message}`)
    .join("\n");
}

export function runCompiled(program: ProgramNode, input = ""): RunResult {
  return runProgram(program, input);
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
    };
  }
  return runCompiled(compiled.program, input);
}
