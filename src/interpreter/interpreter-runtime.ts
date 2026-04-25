import { RuntimeTrap } from "../runtime/errors";
import type { RuntimeValue } from "../runtime/value";
import { stringifyValue } from "../runtime/value";
import type {
  ArrayDeclNode,
  ArrayView,
  AssignTargetNode,
  DebugExecutionRange,
  DebugInfo,
  DebugValueView,
  ExprNode,
  FrameView,
  FunctionDeclNode,
  ProgramNode,
  RuntimeErrorInfo,
  ScopeView,
  SourceRange,
  TypeNode,
  VectorDeclNode,
} from "../types";
import { isPrimitiveType } from "../types";

export type Scope = Map<string, RuntimeValue>;
export type PrimitiveElementType = "int" | "double" | "bool" | "string";

export type ArrayStore = {
  elementType: PrimitiveElementType;
  values: RuntimeValue[];
  dynamic: boolean;
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
  onStep?: (info: InterpreterStepInfo) => "pause" | void;
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

export abstract class InterpreterRuntime {
  protected readonly program: ProgramNode;

  protected readonly inputTokens: string[];

  protected readonly options: InterpreterOptions;

  protected inputIndex = 0;

  protected readonly globals: Scope = new Map();

  protected readonly functions = new Map<string, FunctionDeclNode>();

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

  protected defineArrayDecl(decl: ArrayDeclNode, scope: Scope): void {
    if (decl.size < 0n) {
      this.fail("array size must be non-negative", decl.line);
    }

    const sizeAsNumber = Number(decl.size);
    const elementType = this.toElementType(decl.type.elementType, decl.line);
    const values = Array.from({ length: sizeAsNumber }, () => this.defaultPrimitiveValue(elementType));

    for (let i = 0; i < decl.initializers.length; i += 1) {
      if (i >= values.length) {
        this.fail("too many initializers for array", decl.line);
      }
      const init = decl.initializers[i];
      if (init === undefined) {
        continue;
      }
      values[i] = this.castToElementType(this.evaluateExpr(init), elementType, init.line);
    }

    const arrayValue = this.allocateArray(elementType, false, values);
    this.defineInScope(scope, decl.name, arrayValue, decl.line);
  }

  protected defineVectorDecl(decl: VectorDeclNode, scope: Scope): void {
    const elementType = this.toElementType(decl.type.elementType, decl.line);
    const args = decl.constructorArgs.map((arg) => this.evaluateExpr(arg));
    let values: RuntimeValue[] = [];

    if (args.length === 1) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      values = Array.from({ length: Number(size) }, () => this.defaultPrimitiveValue(elementType));
    } else if (args.length === 2) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      const fillValue = this.castToElementType(args[1] as RuntimeValue, elementType, decl.line);
      values = Array.from({ length: Number(size) }, () => fillValue);
    } else if (args.length > 2) {
      this.fail("too many arguments for vector constructor", decl.line);
    }

    const vectorValue = this.allocateArray(elementType, true, values);
    this.defineInScope(scope, decl.name, vectorValue, decl.line);
  }

  protected expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }> {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind !== "int") {
      this.fail("type mismatch: expected int", line);
    }
    return initialized;
  }

  protected expectDouble(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "double" }> {
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
    this.fail("cannot convert value to bool", line);
  }

  protected expectArray(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "array" }> {
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
    if (current.kind === "uninitialized") {
      if (current.expected === "int") {
        this.writeAssignTarget(target, { kind: "int", value: BigInt(token) }, line);
      } else if (current.expected === "double") {
        this.writeAssignTarget(target, { kind: "double", value: Number(token) }, line);
      } else if (current.expected === "bool") {
        if (token !== "0" && token !== "1") {
          this.fail(`cannot convert '${token}' to bool`, line);
        }
        this.writeAssignTarget(target, { kind: "bool", value: token === "1" }, line);
      } else {
        this.writeAssignTarget(target, { kind: "string", value: token }, line);
      }
      return;
    }
    this.fail("invalid cin target", line);
  }

  protected readAssignTarget(target: AssignTargetNode, line: number): RuntimeValue {
    if (target.kind === "Identifier") {
      return this.resolve(target.name, line);
    }
    return this.getIndexedValue(target.target, target.index, line);
  }

  protected writeAssignTarget(target: AssignTargetNode, value: RuntimeValue, line: number): void {
    if (target.kind === "Identifier") {
      this.assign(target.name, value, line);
      return;
    }
    this.setIndexedValue(target.target, target.index, value, line);
  }

  protected abstract getIndexedValue(targetExpr: ExprNode, indexExpr: ExprNode, line: number): RuntimeValue;

  protected abstract setIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    value: RuntimeValue,
    line: number,
  ): void;

  protected allocateArray(
    elementType: PrimitiveElementType,
    dynamic: boolean,
    values: RuntimeValue[],
  ): RuntimeValue {
    const ref = this.nextArrayRef;
    this.nextArrayRef += 1;
    this.arrays.set(ref, { elementType, values, dynamic });
    return { kind: "array", ref, elementType, dynamic };
  }

  protected castToElementType(
    value: RuntimeValue,
    typeName: PrimitiveElementType,
    line: number,
  ): RuntimeValue {
    return this.coerceRuntimeValue(typeName, value, line);
  }

  protected defaultPrimitiveValue(typeName: PrimitiveElementType): RuntimeValue {
    if (typeName === "int") {
      return { kind: "int", value: 0n };
    }
    if (typeName === "double") {
      return { kind: "double", value: 0 };
    }
    if (typeName === "bool") {
      return { kind: "bool", value: false };
    }
    return { kind: "string", value: "" };
  }

  protected defineInScope(scope: Scope, name: string, value: RuntimeValue, line: number): void {
    if (scope.has(name)) {
      this.fail(`redefinition of '${name}'`, line);
    }
    scope.set(name, value);
  }

  protected define(name: string, value: RuntimeValue): void {
    this.defineInScope(this.currentScope(), name, value, this.currentLine);
  }

  protected resolve(name: string, line: number): RuntimeValue {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      const found = scope.get(name);
      if (found !== undefined) {
        return found;
      }
    }

    const globalValue = this.globals.get(name);
    if (globalValue !== undefined) {
      return globalValue;
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected assign(name: string, value: RuntimeValue, line: number): void {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      if (scope.has(name)) {
        const current = scope.get(name);
        if (current !== undefined) {
          scope.set(name, this.assignWithCurrentType(current, value, line));
          return;
        }
      }
    }

    if (this.globals.has(name)) {
      const current = this.globals.get(name);
      if (current !== undefined) {
        this.globals.set(name, this.assignWithCurrentType(current, value, line));
        return;
      }
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected assignWithCurrentType(
    current: RuntimeValue,
    value: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (current.kind === "uninitialized") {
      return this.coerceRuntimeValue(current.expected, value, line);
    }
    if (current.kind === "array") {
      this.fail("cannot assign to array value directly", line);
    }
    if (current.kind === "void") {
      this.fail("cannot assign to void", line);
    }
    return this.coerceRuntimeValue(current.kind, value, line);
  }

  protected assertPrimitiveType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    const normalizedType = this.normalizePrimitiveType(type, line);
    if (normalizedType === "void") {
      return { kind: "void" };
    }
    const runtimeType = normalizedType === "long long" ? "int" : normalizedType;

    if (value.kind === "uninitialized") {
      if (value.expected !== runtimeType) {
        return this.coerceRuntimeValue(runtimeType, value, line);
      }
      return value;
    }
    return this.coerceRuntimeValue(runtimeType, value, line);
  }

  protected assertType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    if (isPrimitiveType(type)) {
      return this.assertPrimitiveType(type, value, line);
    }

    if (value.kind !== "array") {
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (value.elementType !== this.toElementType(type.elementType, line)) {
      this.fail(`cannot convert '${value.elementType}' to '${type.elementType.name}'`, line);
    }

    if (type.kind === "VectorType" && !value.dynamic) {
      this.fail("cannot convert 'array' to 'vector'", line);
    }

    if (type.kind === "ArrayType" && value.dynamic) {
      this.fail("cannot convert 'vector' to 'array'", line);
    }

    return value;
  }

  protected currentScope(): Scope {
    const scope = this.scopeStack[this.scopeStack.length - 1];
    if (scope === undefined) {
      this.fail("internal scope error", this.currentLine);
    }
    return scope;
  }

  protected step(location: SourceRange, kind: "statement" | "expression", level = kind === "statement" ? 1 : 2): void {
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
    throw new RuntimeTrap(message, this.currentFunction, line);
  }

  protected toElementType(type: TypeNode, line: number): PrimitiveElementType {
    const typeName = this.normalizePrimitiveType(type, line);
    if (typeName === "int" || typeName === "long long") {
      return "int";
    }
    if (typeName === "bool") {
      return "bool";
    }
    if (typeName === "double") {
      return "double";
    }
    if (typeName === "string") {
      return "string";
    }
    this.fail("element type cannot be void", line);
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
  ): "int" | "long long" | "double" | "bool" | "string" | "void" {
    const primitive = this.expectPrimitiveType(type, line);
    return primitive.name;
  }

  protected typeKindName(type: TypeNode): string {
    switch (type.kind) {
      case "PrimitiveType":
        return type.name;
      case "ArrayType":
        return "array";
      case "VectorType":
        return "vector";
    }
  }

  protected serializeScope(scope: Scope): DebugValueView[] {
    return Array.from(scope.entries())
      .map(([name, value]) => this.serializeNamedValue(name, value))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  protected serializeNamedValue(name: string, value: RuntimeValue): DebugValueView {
    return {
      name,
      kind: value.kind,
      value: this.serializeValue(value),
    };
  }

  protected serializeValue(value: RuntimeValue): string {
    switch (value.kind) {
      case "array":
        return `<${value.dynamic ? "vector" : "array"}#${value.ref}>`;
      case "uninitialized":
        return `<uninitialized:${value.expected}>`;
      default:
        return stringifyValue(value);
    }
  }

  protected coerceRuntimeValue(
    expected: "int" | "double" | "bool" | "string",
    value: RuntimeValue,
    line: number,
  ): RuntimeValue {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind === expected) {
      return initialized;
    }
    if (expected === "double" && initialized.kind === "int") {
      return { kind: "double", value: Number(initialized.value) };
    }
    if (expected === "int" && initialized.kind === "double") {
      if (!Number.isFinite(initialized.value) || !Number.isInteger(initialized.value)) {
        this.fail("cannot convert 'double' to 'int'", line);
      }
      return { kind: "int", value: BigInt(initialized.value) };
    }
    this.fail(`cannot convert '${initialized.kind}' to '${expected}'`, line);
  }
}

export function toRuntimeError(error: RuntimeTrap): RuntimeErrorInfo {
  return {
    message: error.message,
    line: error.line,
    functionName: error.functionName,
  };
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
      elementType: store.elementType,
      dynamic: store.dynamic,
      values: store.values.map((value) => serializeValue(value)),
    })),
    watchList: [],
    input: {
      tokens: [...inputTokens],
      nextIndex: inputIndex,
    },
  };
}
