import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";
import type { AssignTargetNode, ExprNode, TypeNode, VectorTypeNode } from "@/types";

export interface EvalCtx {
  evaluateExpr(expr: ExprNode): RuntimeValue;
  fail(message: string, line: number): never;
  expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }>;
  expectBool(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "bool" }>;
  expectArray(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "array" }>;
  ensureInitialized(
    value: RuntimeValue,
    line: number,
    what: string,
  ): Exclude<RuntimeValue, { kind: "uninitialized" }>;
  ensureNotVoid(
    value: Exclude<RuntimeValue, { kind: "uninitialized" }>,
    line: number,
  ): Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>;
  castToElementType(value: RuntimeValue, elementType: TypeNode, line: number): RuntimeValue;
  runtimeValueToType(value: RuntimeValue, line: number): TypeNode;
  defaultValueForType(type: TypeNode, line: number): RuntimeValue;
  isAssignableTarget(expr: ExprNode): expr is AssignTargetNode;
  readAssignTarget(target: AssignTargetNode, line: number): RuntimeValue;
  writeAssignTarget(target: AssignTargetNode, value: RuntimeValue, line: number): void;
  resolveAssignTargetLocation(target: AssignTargetNode, line: number): RuntimeLocation;
  readLocation(location: RuntimeLocation, line: number): RuntimeValue;
  writeLocation(location: RuntimeLocation, value: RuntimeValue, line: number): void;
  allocVector(type: VectorTypeNode, values: RuntimeValue[]): RuntimeValue;
  arrays: Map<number, { type: TypeNode; values: RuntimeValue[] }>;
  findOrInsertMapEntry(
    mapValue: Extract<RuntimeValue, { kind: "map" }>,
    key: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
    line: number,
  ): number;
}
