import { RuntimeTrap } from "@/runtime/errors";
import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";
import { vectorElementType } from "@/stdlib/template-types";
import type {
  ArrayDeclNode,
  AssignTargetNode,
  DebugExecutionRange,
  DebugInfo,
  ExprNode,
  FrameView,
  FunctionDeclNode,
  ProgramNode,
  SourceRange,
  TemplateFunctionDeclNode,
  TypeNode,
  VectorDeclNode,
} from "@/types";
import { isPrimitiveType } from "@/types";

export type Scope = Map<string, RuntimeValue>;
export type ArrayStore = {
  type: import("@/types").ArrayTypeNode | import("@/types").VectorTypeNode;
  values: RuntimeValue[];
};

export type InterpreterStepInfo = {
  line: number;
  callStack: FrameView[];
  kind: "statement" | "expression";
  executionRange: DebugExecutionRange | null;
  stepCount: number;
  debugInfo: DebugInfo;
};

export type InterpreterOptions = {
  onStep?: (info: InterpreterStepInfo) => "pause" | undefined;
};

export class PauseTrap {
  readonly stepCount: number;

  readonly reason: "step" | "breakpoint";

  readonly debugInfo: DebugInfo;

  constructor(stepCount: number, reason: "step" | "breakpoint", debugInfo: DebugInfo) {
    this.stepCount = stepCount;
    this.reason = reason;
    this.debugInfo = debugInfo;
  }
}

export abstract class InterpreterRuntimeCore {
  protected readonly program: ProgramNode;

  protected readonly inputTokens: string[];

  protected readonly options: InterpreterOptions;

  protected inputIndex = 0;

  protected readonly globals: Scope = new Map();

  protected readonly functions = new Map<string, FunctionDeclNode>();

  protected readonly templateFunctions = new Map<string, TemplateFunctionDeclNode>();

  protected readonly output = { stdout: "", stderr: "" };

  protected readonly arrays = new Map<number, ArrayStore>();

  protected nextArrayRef = 1;

  protected currentFunction = "<global>";

  protected currentLine = 1;

  protected readonly scopeStack: Scope[] = [];

  protected readonly frameStack: FrameView[] = [];

  protected currentExecutionRange: DebugExecutionRange | null = null;

  protected stepCount = 0;

  constructor(program: ProgramNode, input: string, options: InterpreterOptions) {
    this.program = program;
    this.options = options;
    this.inputTokens = input
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  protected abstract buildDebugInfo(): DebugInfo;

  protected abstract evaluateExpr(expr: ExprNode): RuntimeValue;

  protected abstract defaultValueForType(type: TypeNode, line: number): RuntimeValue;

  protected abstract castToElementType(
    value: RuntimeValue,
    type: TypeNode,
    line: number,
  ): RuntimeValue;

  protected abstract createFixedArrayValue(
    type: import("@/types").ArrayTypeNode,
    dimensions: bigint[],
    line: number,
  ): RuntimeValue;

  protected abstract applyArrayInitializers(
    target: RuntimeValue,
    initializers: ExprNode[],
    line: number,
  ): void;

  protected abstract readLocation(location: RuntimeLocation, line: number): RuntimeValue;

  protected abstract writeLocation(
    location: RuntimeLocation,
    value: RuntimeValue,
    line: number,
  ): void;

  protected abstract resolveAssignTargetLocation(
    target: AssignTargetNode,
    line: number,
  ): RuntimeLocation;

  protected abstract getIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    line: number,
  ): RuntimeValue;

  protected abstract setIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    value: RuntimeValue,
    line: number,
  ): void;

  protected abstract assertType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue;

  protected defineArrayDecl(decl: ArrayDeclNode, scope: Scope): void {
    for (const dimension of decl.dimensions) {
      if (dimension < 0n) {
        this.fail("array size must be non-negative", decl.line);
      }
    }
    const arrayValue = this.createFixedArrayValue(decl.type, decl.dimensions, decl.line);
    this.applyArrayInitializers(arrayValue, decl.initializers, decl.line);
    this.defineInScope(scope, decl.name, arrayValue, decl.line);
  }

  protected defineVectorDecl(decl: VectorDeclNode, scope: Scope): void {
    const args = decl.constructorArgs.map((arg) => this.evaluateExpr(arg));
    const vectorValue = this.constructVectorValue(decl.type, args, decl.line);
    this.defineInScope(scope, decl.name, vectorValue, decl.line);
  }

  protected constructVectorValue(
    type: VectorDeclNode["type"],
    args: RuntimeValue[],
    line: number,
  ): RuntimeValue {
    let values: RuntimeValue[] = [];

    if (args.length === 1) {
      const size = this.expectInt(args[0] as RuntimeValue, line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", line);
      }
      values = Array.from({ length: Number(size) }, () =>
        this.defaultValueForType(vectorElementType(type), line),
      );
    } else if (args.length === 2) {
      const size = this.expectInt(args[0] as RuntimeValue, line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", line);
      }
      const fillValue = this.castToElementType(
        args[1] as RuntimeValue,
        vectorElementType(type),
        line,
      );
      values = Array.from({ length: Number(size) }, () => fillValue);
    } else if (args.length > 2) {
      this.fail("too many arguments for vector constructor", line);
    }

    return this.allocateArray(type, values);
  }

  protected expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind === "char") {
      return { kind: "int", value: BigInt(initialized.value.codePointAt(0) ?? 0) };
    }
    if (initialized.kind !== "int") {
      this.fail("type mismatch: expected int", line);
    }
    return initialized;
  }

  protected expectDouble(
    value: RuntimeValue,
    line: number,
  ): Extract<RuntimeValue, { kind: "double" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "double") {
      this.fail("type mismatch: expected double", line);
    }
    return initialized;
  }

  protected expectBool(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "bool" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "bool") {
      this.fail("type mismatch: expected bool", line);
    }
    return initialized;
  }

  protected evaluateCondition(value: RuntimeValue, line: number): boolean {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind === "bool") {
      return initialized.value;
    }
    if (initialized.kind === "int") {
      return initialized.value !== 0n;
    }
    if (initialized.kind === "double") {
      return initialized.value !== 0;
    }
    if (initialized.kind === "char") {
      return initialized.value !== "\0";
    }
    this.fail("cannot convert value to bool", line);
  }

  protected expectArray(
    value: RuntimeValue,
    line: number,
  ): Extract<RuntimeValue, { kind: "array" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "array") {
      this.fail("type mismatch: expected array/vector", line);
    }
    return initialized;
  }

  protected ensureInitialized(
    value: RuntimeValue,
    line: number,
    name: string,
  ): Exclude<RuntimeValue, { kind: "uninitialized" }> {
    if (value.kind === "uninitialized") {
      this.fail(`use of uninitialized variable '${name}'`, line);
    }
    return value;
  }

  protected ensureNotVoid(
    value: Exclude<RuntimeValue, { kind: "uninitialized" }>,
    line: number,
  ): Exclude<RuntimeValue, { kind: "void" | "uninitialized" }> {
    if (value.kind === "void") {
      this.fail("void value is not allowed in expression", line);
    }
    return value;
  }

  protected assignFromInput(target: AssignTargetNode, token: string, line: number): void {
    const current = this.readAssignTarget(target, line);
    if (current.kind === "int") {
      this.writeAssignTarget(target, { kind: "int", value: BigInt(token) }, line);
      return;
    }
    if (current.kind === "bool") {
      if (token !== "0" && token !== "1") {
        this.fail(`cannot convert '${token}' to bool`, line);
      }
      this.writeAssignTarget(target, { kind: "bool", value: token === "1" }, line);
      return;
    }
    if (current.kind === "double") {
      this.writeAssignTarget(target, { kind: "double", value: Number(token) }, line);
      return;
    }
    if (current.kind === "string") {
      this.writeAssignTarget(target, { kind: "string", value: token }, line);
      return;
    }
    if (current.kind === "char") {
      if (Array.from(token).length !== 1) {
        this.fail(`cannot convert '${token}' to char`, line);
      }
      this.writeAssignTarget(target, { kind: "char", value: token }, line);
      return;
    }
    if (current.kind === "uninitialized") {
      const expectedType = current.expectedType;
      if (
        expectedType.kind === "PrimitiveType" &&
        (expectedType.name === "int" || expectedType.name === "long long")
      ) {
        this.writeAssignTarget(target, { kind: "int", value: BigInt(token) }, line);
      } else if (expectedType.kind === "PrimitiveType" && expectedType.name === "double") {
        this.writeAssignTarget(target, { kind: "double", value: Number(token) }, line);
      } else if (expectedType.kind === "PrimitiveType" && expectedType.name === "bool") {
        if (token !== "0" && token !== "1") {
          this.fail(`cannot convert '${token}' to bool`, line);
        }
        this.writeAssignTarget(target, { kind: "bool", value: token === "1" }, line);
      } else if (expectedType.kind === "PrimitiveType" && expectedType.name === "char") {
        if (Array.from(token).length !== 1) {
          this.fail(`cannot convert '${token}' to char`, line);
        }
        this.writeAssignTarget(target, { kind: "char", value: token }, line);
      } else {
        this.writeAssignTarget(target, { kind: "string", value: token }, line);
      }
      return;
    }
    this.fail("invalid cin target", line);
  }

  protected readAssignTarget(target: AssignTargetNode, line: number): RuntimeValue {
    return this.readLocation(this.resolveAssignTargetLocation(target, line), line);
  }

  protected writeAssignTarget(target: AssignTargetNode, value: RuntimeValue, line: number): void {
    this.writeLocation(this.resolveAssignTargetLocation(target, line), value, line);
  }

  protected currentScope(): Scope {
    const scope = this.scopeStack[this.scopeStack.length - 1];
    if (scope === undefined) {
      this.fail("internal scope error", this.currentLine);
    }
    return scope;
  }

  protected step(
    location: SourceRange,
    kind: "statement" | "expression",
    level = kind === "statement" ? 1 : 2,
  ): void {
    this.stepCount += 1;
    this.currentLine = location.line;
    this.currentExecutionRange = {
      startLine: location.line,
      startCol: location.col,
      endLine: location.endLine,
      endCol: location.endCol,
      level,
    };
    const top = this.frameStack[this.frameStack.length - 1];
    if (top !== undefined) {
      top.line = location.line;
    }
    const debugInfo = this.buildDebugInfo();
    const action = this.options.onStep?.({
      line: location.line,
      kind,
      executionRange: this.currentExecutionRange,
      stepCount: this.stepCount,
      callStack: this.frameStack.map((frame) => ({
        functionName: frame.functionName,
        line: frame.line,
      })),
      debugInfo,
    });
    if (action === "pause") {
      throw new PauseTrap(this.stepCount, "step", debugInfo);
    }
  }

  protected fail(message: string, line: number): never {
    const stackFrames =
      this.frameStack.length > 0
        ? [...this.frameStack]
            .map((frame, index, frames) => ({
              functionName: frame.functionName,
              line: index === frames.length - 1 ? line : frame.line,
            }))
            .reverse()
        : [{ functionName: this.currentFunction, line }];
    throw new RuntimeTrap(message, stackFrames);
  }

  protected expectPrimitiveType(
    type: TypeNode,
    line: number,
  ): Extract<TypeNode, { kind: "PrimitiveType" }> {
    if (!isPrimitiveType(type)) {
      this.fail(`expected primitive type, got '${this.typeKindName(type)}'`, line);
    }
    return type;
  }

  protected isVoidType(type: TypeNode): boolean {
    return isPrimitiveType(type) && type.name === "void";
  }

  protected normalizePrimitiveType(
    type: TypeNode,
    line: number,
  ): "int" | "long long" | "double" | "bool" | "char" | "string" | "void" {
    const primitive = this.expectPrimitiveType(type, line);
    return primitive.name;
  }

  protected intToChar(value: bigint, line: number): Extract<RuntimeValue, { kind: "char" }> {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0x10ffff) {
      this.fail("cannot convert 'int' to 'char'", line);
    }
    const text = String.fromCodePoint(numeric);
    if (Array.from(text).length !== 1) {
      this.fail("cannot convert 'int' to 'char'", line);
    }
    return { kind: "char", value: text };
  }

  protected abstract typeKindName(type: TypeNode): string;

  protected abstract defineInScope(
    scope: Scope,
    name: string,
    value: RuntimeValue,
    line: number,
  ): void;

  protected allocateArray(
    type: import("@/types").ArrayTypeNode | import("@/types").VectorTypeNode,
    values: RuntimeValue[],
  ): RuntimeValue {
    const ref = this.nextArrayRef;
    this.nextArrayRef += 1;
    this.arrays.set(ref, { type, values });
    return { kind: "array", ref, type };
  }
}
