import type { RuntimeStackFrame } from "@/types";
import type { RuntimeValue } from "./value";

export class RuntimeTrap extends Error {
  readonly line: number;

  readonly functionName: string;

  readonly stackFrames: RuntimeStackFrame[];

  constructor(message: string, stackFrames: RuntimeStackFrame[]) {
    super(message);
    this.stackFrames = stackFrames.length > 0 ? stackFrames : [{ functionName: "<runtime>", line: 1 }];
    const topFrame = this.stackFrames[0] as RuntimeStackFrame;
    this.line = topFrame.line;
    this.functionName = topFrame.functionName;
  }
}

export class ReturnSignal {
  readonly value: RuntimeValue;

  constructor(value: RuntimeValue) {
    this.value = value;
  }
}

export class BreakSignal {}

export class ContinueSignal {}
