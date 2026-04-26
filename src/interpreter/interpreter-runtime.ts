import { RuntimeTrap } from "../runtime/errors";
import type { RuntimeLocation, RuntimeValue } from "../runtime/value";
import { stringifyValue } from "../runtime/value";
import type {
  ArrayDeclNode,
  ArrayTypeNode,
  AssignTargetNode,
  DebugExecutionRange,
  DebugInfo,
  DebugValueView,
  ExprNode,
  FrameView,
  FunctionDeclNode,
  ProgramNode,
  RuntimeErrorInfo,
  SourceRange,
  TypeNode,
  VectorDeclNode,
  VectorTypeNode,
} from "../types";
import { isPointerType, isPrimitiveType, isReferenceType, typeToString } from "../types";

export type Scope = Map<string, RuntimeValue>;
export type ArrayStore = {
  type: ArrayTypeNode | VectorTypeNode;
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
    let values: RuntimeValue[] = [];

    if (args.length === 1) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      values = Array.from({ length: Number(size) }, () =>
        this.defaultValueForType(decl.type.elementType, decl.line),
      );
    } else if (args.length === 2) {
      const size = this.expectInt(args[0] as RuntimeValue, decl.line).value;
      if (size < 0n) {
        this.fail("vector size must be non-negative", decl.line);
      }
      const fillValue = this.castToElementType(
        args[1] as RuntimeValue,
        decl.type.elementType,
        decl.line,
      );
      values = Array.from({ length: Number(size) }, () => fillValue);
    } else if (args.length > 2) {
      this.fail("too many arguments for vector constructor", decl.line);
    }

    const vectorValue = this.allocateArray(decl.type, values);
    this.defineInScope(scope, decl.name, vectorValue, decl.line);
  }

  protected expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }> {
    const initialized = this.ensureInitialized(value, line, "value");
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

  protected allocateArray(
    type: ArrayTypeNode | VectorTypeNode,
    values: RuntimeValue[],
  ): RuntimeValue {
    const ref = this.nextArrayRef;
    this.nextArrayRef += 1;
    this.arrays.set(ref, { type, values });
    return { kind: "array", ref, type };
  }

  protected castToElementType(value: RuntimeValue, type: TypeNode, line: number): RuntimeValue {
    return this.assertType(type, value, line);
  }

  protected defaultValueForType(type: TypeNode, line: number): RuntimeValue {
    if (isPrimitiveType(type)) {
      if (type.name === "int" || type.name === "long long") {
        return { kind: "int", value: 0n };
      }
      if (type.name === "double") {
        return { kind: "double", value: 0 };
      }
      if (type.name === "bool") {
        return { kind: "bool", value: false };
      }
      if (type.name === "string") {
        return { kind: "string", value: "" };
      }
      this.fail("element type cannot be void", line);
    }
    if (type.kind === "VectorType") {
      return this.allocateArray(type, []);
    }
    if (type.kind === "PairType") {
      return {
        kind: "pair",
        type,
        first: this.defaultValueForType(type.firstType, line),
        second: this.defaultValueForType(type.secondType, line),
      };
    }
    if (type.kind === "TupleType") {
      return {
        kind: "tuple",
        type,
        values: type.elementTypes.map((elementType) => this.defaultValueForType(elementType, line)),
      };
    }
    this.fail("fixed array value requires dimensions", line);
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
    const raw = this.resolveRaw(name, line);
    if (raw.kind === "reference") {
      return this.readLocation(raw.target, line);
    }
    return raw;
  }

  protected resolveRaw(name: string, line: number): RuntimeValue {
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

  protected resolveBindingLocation(name: string, line: number): RuntimeLocation {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined || !scope.has(name)) {
        continue;
      }
      const value = scope.get(name);
      if (value === undefined) {
        break;
      }
      if (value.kind === "reference") {
        return value.target;
      }
      return { kind: "binding", scope, name, type: this.runtimeValueToType(value, line) };
    }

    if (this.globals.has(name)) {
      const value = this.globals.get(name);
      if (value === undefined) {
        this.fail(`'${name}' was not declared in this scope`, line);
      }
      if (value.kind === "reference") {
        return value.target;
      }
      return {
        kind: "binding",
        scope: this.globals,
        name,
        type: this.runtimeValueToType(value, line),
      };
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected assign(name: string, value: RuntimeValue, line: number): void {
    const raw = this.resolveRaw(name, line);
    if (raw.kind === "reference") {
      this.writeLocation(raw.target, value, line);
      return;
    }
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
      return this.assertType(current.expectedType, value, line);
    }
    if (current.kind === "array") {
      this.fail("cannot assign to array value directly", line);
    }
    if (current.kind === "pointer") {
      return this.assertType(
        { kind: "PointerType", pointeeType: current.pointeeType },
        value,
        line,
      );
    }
    if (current.kind === "reference") {
      this.writeLocation(current.target, value, line);
      return current;
    }
    if (current.kind === "pair") {
      return this.assertType(current.type, value, line);
    }
    if (current.kind === "tuple") {
      return this.assertType(current.type, value, line);
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
      const expectedType = value.expectedType;
      if (!isPrimitiveType(expectedType)) {
        return this.assertType(type, value, line);
      }
      const expectedRuntimeType = expectedType.name === "long long" ? "int" : expectedType.name;
      if (expectedRuntimeType !== runtimeType) {
        return this.coerceRuntimeValue(runtimeType, value, line);
      }
      return value;
    }
    return this.coerceRuntimeValue(runtimeType, value, line);
  }

  protected assertType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    if (isReferenceType(type)) {
      this.fail("reference values require a bound location", line);
    }
    if (isPrimitiveType(type)) {
      return this.assertPrimitiveType(type, value, line);
    }
    if (isPointerType(type)) {
      if (value.kind === "pointer") {
        if (!this.sameType(type.pointeeType, value.pointeeType)) {
          this.fail(
            `cannot convert '${this.typeToRuntimeString({ kind: "PointerType", pointeeType: value.pointeeType })}' to '${this.typeToRuntimeString(type)}'`,
            line,
          );
        }
        return value;
      }
      if (value.kind === "int" && value.value === 0n) {
        return { kind: "pointer", pointeeType: type.pointeeType, target: null };
      }
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (type.kind === "PairType") {
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      if (value.kind !== "pair") {
        this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
      }
      return {
        kind: "pair",
        type,
        first: this.assertType(type.firstType, value.first, line),
        second: this.assertType(type.secondType, value.second, line),
      };
    }

    if (type.kind === "TupleType") {
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      if (value.kind !== "tuple") {
        this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
      }
      if (value.values.length !== type.elementTypes.length) {
        this.fail(
          `cannot convert '${this.typeToRuntimeString(value.type)}' to '${this.typeToRuntimeString(type)}'`,
          line,
        );
      }
      return {
        kind: "tuple",
        type,
        values: type.elementTypes.map((elementType, index) =>
          this.assertType(elementType, value.values[index] as RuntimeValue, line),
        ),
      };
    }

    if (value.kind !== "array") {
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (type.kind === "VectorType" && value.type.kind !== "VectorType") {
      this.fail("cannot convert 'array' to 'vector'", line);
    }

    if (type.kind === "ArrayType" && value.type.kind !== "ArrayType") {
      this.fail("cannot convert 'vector' to 'array'", line);
    }

    if (
      (type.kind === "ArrayType" || type.kind === "VectorType") &&
      (value.type.kind === "ArrayType" || value.type.kind === "VectorType") &&
      !this.sameType(type.elementType, value.type.elementType)
    ) {
      this.fail(
        `cannot convert '${this.typeToRuntimeString(value.type)}' to '${this.typeToRuntimeString(type)}'`,
        line,
      );
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
    throw new RuntimeTrap(message, this.currentFunction, line);
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
      case "PairType":
        return "pair";
      case "TupleType":
        return "tuple";
      case "PointerType":
        return "pointer";
      case "ReferenceType":
        return "reference";
    }
  }

  protected serializeScope(scope: Scope): DebugValueView[] {
    return Array.from(scope.entries())
      .map(([name, value]) => this.serializeNamedValue(name, value))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  protected serializeNamedValue(name: string, value: RuntimeValue): DebugValueView {
    if (value.kind === "reference") {
      return {
        name,
        kind: "reference",
        value: this.serializeValue(this.readLocation(value.target, this.currentLine)),
      };
    }
    return {
      name,
      kind: value.kind,
      value: this.serializeValue(value),
    };
  }

  protected serializeValue(value: RuntimeValue): string {
    switch (value.kind) {
      case "array":
        return `<${value.type.kind === "VectorType" ? "vector" : "array"}#${value.ref}>`;
      case "pointer":
        return value.target === null ? "nullptr" : `<pointer:${typeToString(value.pointeeType)}>`;
      case "reference":
        return this.serializeValue(this.readLocation(value.target, this.currentLine));
      case "uninitialized":
        return `<uninitialized:${typeToString(value.expectedType)}>`;
      case "pair":
        return `(${this.serializeValue(value.first)}, ${this.serializeValue(value.second)})`;
      case "tuple":
        return `(${value.values.map((element) => this.serializeValue(element)).join(", ")})`;
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
    if (initialized.kind === "reference") {
      return this.coerceRuntimeValue(expected, this.readLocation(initialized.target, line), line);
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

  private createFixedArrayValue(
    type: ArrayTypeNode,
    dimensions: bigint[],
    line: number,
  ): RuntimeValue {
    const size = dimensions[0];
    if (size === undefined) {
      this.fail("missing array dimension", line);
    }
    const values = Array.from({ length: Number(size) }, () => {
      if (type.elementType.kind === "ArrayType") {
        return this.createFixedArrayValue(type.elementType, dimensions.slice(1), line);
      }
      return this.defaultValueForType(type.elementType, line);
    });
    return this.allocateArray(type, values);
  }

  private applyArrayInitializers(
    target: RuntimeValue,
    initializers: ExprNode[],
    line: number,
  ): void {
    const flatTargets = this.flattenArrayElements(target, line);
    if (initializers.length > flatTargets.length) {
      this.fail("too many initializers for array", line);
    }
    for (let i = 0; i < initializers.length; i += 1) {
      const init = initializers[i];
      const targetSlot = flatTargets[i];
      if (init === undefined || targetSlot === undefined) {
        continue;
      }
      targetSlot.assign(this.evaluateExpr(init), init.line);
    }
  }

  private flattenArrayElements(
    target: RuntimeValue,
    line: number,
  ): Array<{ assign: (value: RuntimeValue, assignLine: number) => void }> {
    const arrayValue = this.expectArray(target, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    const slots: Array<{ assign: (value: RuntimeValue, assignLine: number) => void }> = [];
    for (let i = 0; i < store.values.length; i += 1) {
      if (store.type.elementType.kind === "ArrayType") {
        const nested = store.values[i];
        if (nested !== undefined) {
          slots.push(...this.flattenArrayElements(nested, line));
        }
        continue;
      }
      slots.push({
        assign: (value: RuntimeValue, assignLine: number) => {
          store.values[i] = this.castToElementType(value, store.type.elementType, assignLine);
        },
      });
    }
    return slots;
  }

  private sameType(left: TypeNode, right: TypeNode): boolean {
    if (left.kind !== right.kind) {
      return false;
    }
    switch (left.kind) {
      case "PrimitiveType":
        return right.kind === "PrimitiveType" && left.name === right.name;
      case "ArrayType":
        if (right.kind !== "ArrayType") {
          return false;
        }
        return this.sameType(left.elementType, right.elementType);
      case "VectorType":
        if (right.kind !== "VectorType") {
          return false;
        }
        return this.sameType(left.elementType, right.elementType);
      case "PointerType":
        return right.kind === "PointerType" && this.sameType(left.pointeeType, right.pointeeType);
      case "PairType":
        return (
          right.kind === "PairType" &&
          this.sameType(left.firstType, right.firstType) &&
          this.sameType(left.secondType, right.secondType)
        );
      case "TupleType":
        return (
          right.kind === "TupleType" &&
          left.elementTypes.length === right.elementTypes.length &&
          left.elementTypes.every((elementType, index) => {
            const rightElementType = right.elementTypes[index];
            return rightElementType !== undefined && this.sameType(elementType, rightElementType);
          })
        );
      case "ReferenceType":
        return (
          right.kind === "ReferenceType" && this.sameType(left.referredType, right.referredType)
        );
    }
  }

  private typeToRuntimeString(type: TypeNode): string {
    return typeToString(type);
  }

  protected readLocation(location: RuntimeLocation, line: number): RuntimeValue {
    switch (location.kind) {
      case "binding": {
        const value = location.scope.get(location.name);
        if (value === undefined) {
          this.fail(`'${location.name}' was not declared in this scope`, line);
        }
        if (value.kind === "reference") {
          return this.readLocation(value.target, line);
        }
        return value;
      }
      case "array": {
        const store = this.arrays.get(location.ref);
        if (store === undefined) {
          this.fail("invalid array reference", line);
        }
        if (location.index < 0 || location.index >= store.values.length) {
          this.fail(
            `index ${location.index.toString()} out of range for array of size ${store.values.length}`,
            line,
          );
        }
        const value = store.values[location.index];
        if (value === undefined) {
          this.fail("invalid index access", line);
        }
        return value.kind === "reference" ? this.readLocation(value.target, line) : value;
      }
      case "tuple": {
        const parent = this.readLocation(location.parent, line);
        if (parent.kind !== "tuple") {
          this.fail("type mismatch: expected tuple", line);
        }
        const value = parent.values[location.index];
        if (value === undefined) {
          this.fail(
            `tuple index ${location.index.toString()} out of range for tuple of size ${parent.values.length}`,
            line,
          );
        }
        return value.kind === "reference" ? this.readLocation(value.target, line) : value;
      }
      case "string": {
        const parent = this.readLocation(location.parent, line);
        if (parent.kind !== "string") {
          this.fail("type mismatch: expected string", line);
        }
        if (location.index < 0 || location.index >= parent.value.length) {
          this.fail(
            `index ${location.index.toString()} out of range for string of size ${parent.value.length}`,
            line,
          );
        }
        return { kind: "string", value: parent.value[location.index] ?? "" };
      }
    }
  }

  protected writeLocation(location: RuntimeLocation, value: RuntimeValue, line: number): void {
    switch (location.kind) {
      case "binding": {
        const current = location.scope.get(location.name);
        if (current === undefined) {
          this.fail(`'${location.name}' was not declared in this scope`, line);
        }
        if (current.kind === "reference") {
          this.writeLocation(current.target, value, line);
          return;
        }
        location.scope.set(location.name, this.assignWithCurrentType(current, value, line));
        return;
      }
      case "array": {
        const store = this.arrays.get(location.ref);
        if (store === undefined) {
          this.fail("invalid array reference", line);
        }
        if (location.index < 0 || location.index >= store.values.length) {
          this.fail(
            `index ${location.index.toString()} out of range for array of size ${store.values.length}`,
            line,
          );
        }
        store.values[location.index] = this.castToElementType(value, location.type, line);
        return;
      }
      case "tuple": {
        const current = this.readLocation(location.parent, line);
        if (current.kind !== "tuple") {
          this.fail("type mismatch: expected tuple", line);
        }
        if (location.index < 0 || location.index >= current.values.length) {
          this.fail(
            `tuple index ${location.index.toString()} out of range for tuple of size ${current.values.length}`,
            line,
          );
        }
        const nextValues = [...current.values];
        nextValues[location.index] = this.assertType(location.type, value, line);
        this.writeLocation(
          location.parent,
          {
            kind: "tuple",
            type: current.type,
            values: nextValues,
          },
          line,
        );
        return;
      }
      case "string": {
        const current = this.readLocation(location.parent, line);
        if (current.kind !== "string") {
          this.fail("type mismatch: expected string", line);
        }
        const assigned = this.assertType({ kind: "PrimitiveType", name: "string" }, value, line);
        if (assigned.kind !== "string" || assigned.value.length !== 1) {
          this.fail("string element assignment requires a single character", line);
        }
        const next =
          current.value.slice(0, location.index) +
          assigned.value +
          current.value.slice(location.index + 1);
        this.writeLocation(location.parent, { kind: "string", value: next }, line);
        return;
      }
    }
  }

  protected runtimeValueToType(value: RuntimeValue, _line: number): TypeNode {
    switch (value.kind) {
      case "int":
        return { kind: "PrimitiveType", name: "int" };
      case "double":
        return { kind: "PrimitiveType", name: "double" };
      case "bool":
        return { kind: "PrimitiveType", name: "bool" };
      case "string":
        return { kind: "PrimitiveType", name: "string" };
      case "pair":
        return value.type;
      case "tuple":
        return value.type;
      case "array":
        return value.type;
      case "pointer":
        return { kind: "PointerType", pointeeType: value.pointeeType };
      case "reference":
        return value.type;
      case "uninitialized":
        return value.expectedType;
      case "void":
        return { kind: "PrimitiveType", name: "void" };
    }
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
