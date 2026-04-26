import { compile } from "@/compiler";
import { createCompileErrorInfo, DEFAULT_SOURCE_FILENAME } from "@/diagnostics";
import { buildDebugState, runProgram } from "@/interpreter";
import type { DebugState, RunResult } from "@/types";

type ResumeMode =
  | { kind: "stepInto" }
  | { kind: "stepOver"; baseDepth: number }
  | { kind: "stepOut"; baseDepth: number }
  | { kind: "run"; breakpoints: Set<number> };

export class DebugSession {
  private readonly source: string;

  private readonly input: string;

  private readonly breakpoints = new Set<number>();

  private state: DebugState;

  constructor(source: string, input = "") {
    this.source = source;
    this.input = input;
    this.state = {
      status: "ready",
      currentLine: 1,
      callStack: [],
      output: { stdout: "", stderr: "" },
      error: null,
      localVars: [],
      globalVars: [],
      arrays: [],
      watchList: [],
      input: {
        tokens: this.tokenizeInput(input),
        nextIndex: 0,
      },
      executionRange: null,
      stepCount: 0,
      pauseReason: null,
    };
  }

  setBreakpoint(line: number): DebugState {
    this.breakpoints.add(line);
    return this.state;
  }

  removeBreakpoint(line: number): DebugState {
    this.breakpoints.delete(line);
    return this.state;
  }

  listBreakpoints(): number[] {
    return Array.from(this.breakpoints).sort((left, right) => left - right);
  }

  stepInto(): DebugState {
    return this.resume({ kind: "stepInto" });
  }

  stepOver(): DebugState {
    return this.resume({ kind: "stepOver", baseDepth: Math.max(1, this.state.callStack.length) });
  }

  stepOut(): DebugState {
    return this.resume({ kind: "stepOut", baseDepth: this.state.callStack.length });
  }

  run(): DebugState {
    return this.resume({ kind: "run", breakpoints: new Set(this.breakpoints) });
  }

  pause(): DebugState {
    if (this.state.status === "running") {
      this.state = {
        ...this.state,
        status: "paused",
      };
    }
    return this.state;
  }

  getState(): DebugState {
    return this.state;
  }

  private resume(mode: ResumeMode): DebugState {
    const compiled = compile(this.source);
    if (!compiled.ok) {
      this.state = {
        status: "error",
        currentLine: compiled.errors[0]?.line ?? 1,
        callStack: [],
        output: { stdout: "", stderr: "" },
        error: createCompileErrorInfo(compiled.errors, DEFAULT_SOURCE_FILENAME),
        localVars: [],
        globalVars: [],
        arrays: [],
        watchList: [],
        input: {
          tokens: this.tokenizeInput(this.input),
          nextIndex: 0,
        },
        executionRange: null,
        stepCount: 0,
        pauseReason: null,
      };
      return this.state;
    }

    const previousStepCount = this.state.stepCount;
    let pauseReason: "step" | "breakpoint" | null = null;
    const result: RunResult = runProgram(compiled.program, this.input, {
      onStep: (step) => {
        if (step.stepCount <= previousStepCount) {
          return;
        }

        if (mode.kind === "run" && step.kind === "statement" && mode.breakpoints.has(step.line)) {
          pauseReason = "breakpoint";
          return "pause";
        }

        if (mode.kind === "stepInto") {
          pauseReason = "step";
          return "pause";
        }

        if (mode.kind === "stepOver") {
          if (step.callStack.length < mode.baseDepth) {
            pauseReason = "step";
            return "pause";
          }
          if (step.callStack.length === mode.baseDepth && step.kind === "statement") {
            pauseReason = "step";
            return "pause";
          }
          return;
        }

        if (mode.kind !== "stepOut") {
          return;
        }

        if (mode.baseDepth <= 1) {
          return;
        }
        if (step.callStack.length < mode.baseDepth) {
          pauseReason = "step";
          return "pause";
        }
        return;
      },
    });

    this.state = buildDebugState(result, pauseReason, result.stepCount);
    return this.state;
  }

  private tokenizeInput(input: string): string[] {
    return input
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
}
