import type { RuntimeValue } from "./value";

export class RuntimeTrap extends Error {
  readonly line: number;

  readonly functionName: string;

  constructor(message: string, functionName: string, line: number) {
    super(message);
    this.line = line;
    this.functionName = functionName;
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
