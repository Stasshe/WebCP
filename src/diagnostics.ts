import type { CompileError, RuntimeErrorInfo, RuntimeStackFrame } from "@/types";
import type { RuntimeTrap } from "@/runtime/errors";

export const DEFAULT_SOURCE_FILENAME = "main.cpp";

export function formatCompileError(filename: string, error: CompileError): string {
  return `${filename}:${error.line}:${error.col}: error: ${error.message}`;
}

export function formatCompileErrors(
  errors: CompileError[],
  filename = DEFAULT_SOURCE_FILENAME,
): string {
  return errors.map((error) => formatCompileError(filename, error)).join("\n");
}

export function formatRuntimeError(summary: string, stack: RuntimeStackFrame[]): string {
  const lines = [`Runtime Error: ${summary}`];
  for (const frame of stack) {
    lines.push(`  at ${frame.functionName}:${frame.line}`);
  }
  return lines.join("\n");
}

export function createCompileErrorInfo(
  errors: CompileError[],
  filename = DEFAULT_SOURCE_FILENAME,
): RuntimeErrorInfo {
  const first = errors[0] ?? { line: 1, col: 1, message: "unknown compile error" };
  return {
    message: formatCompileErrors(errors, filename),
    summary: first.message,
    line: first.line,
    col: first.col,
    functionName: "<compile>",
    filename,
    stack: [],
  };
}

export function toRuntimeErrorInfo(error: RuntimeTrap): RuntimeErrorInfo {
  return {
    message: formatRuntimeError(error.message, error.stackFrames),
    summary: error.message,
    line: error.line,
    col: null,
    functionName: error.functionName,
    filename: null,
    stack: error.stackFrames,
  };
}
