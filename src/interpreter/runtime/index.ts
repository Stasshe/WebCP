import type { RuntimeTrap } from "@/runtime/errors";
import type { RuntimeValue } from "@/runtime/value";
import { toRuntimeErrorInfo } from "@/diagnostics";
import type {
  DebugExecutionRange,
  DebugInfo,
  DebugValueView,
  FrameView,
  RuntimeErrorInfo,
} from "@/types";
import { typeToString } from "@/types";
import type { ArrayStore, Scope } from "./core";
import { InterpreterRuntimeSupport } from "./support";

export type {
  ArrayStore,
  InterpreterOptions,
  InterpreterStepInfo,
  Scope,
} from "./core";
export { PauseTrap } from "./core";

export abstract class InterpreterRuntime extends InterpreterRuntimeSupport {}

export function toRuntimeError(error: RuntimeTrap): RuntimeErrorInfo {
  return toRuntimeErrorInfo(error);
}

export function buildDebugInfoView(
  currentLine: number,
  executionRange: DebugExecutionRange | null,
  frameStack: FrameView[],
  scopeStack: Scope[],
  globals: Scope,
  arrays: Map<number, ArrayStore>,
  inputTokens: string[],
  inputIndex: number,
  serializeScope: (scope: Scope) => DebugValueView[],
  serializeValue: (value: RuntimeValue) => string,
): DebugInfo {
  return {
    currentLine,
    executionRange,
    callStack: frameStack.map((frame) => ({
      functionName: frame.functionName,
      line: frame.line,
    })),
    localVars: scopeStack.map((scope, index) => ({
      name: `scope#${index}`,
      vars: serializeScope(scope),
    })),
    globalVars: serializeScope(globals),
    arrays: Array.from(arrays.entries()).map(([ref, store]) => ({
      ref,
      elementType: typeToString(store.type.elementType),
      dynamic: store.type.kind === "VectorType",
      values: store.values.map((value) => serializeValue(value)),
    })),
    watchList: [],
    input: {
      tokens: [...inputTokens],
      nextIndex: inputIndex,
    },
  };
}
