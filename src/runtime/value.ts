import type {
  MapTypeNode,
  PairTypeNode,
  PrimitiveTypeNode,
  ReferenceTypeNode,
  TupleTypeNode,
  TypeNode,
  VectorTypeNode,
} from "@/types";

export type RuntimeLocation =
  | { kind: "binding"; scope: Map<string, RuntimeValue>; name: string; type: TypeNode }
  | { kind: "array"; ref: number; index: number; type: TypeNode }
  | {
      // これ特別扱いしちゃってる
      kind: "map";
      parent: RuntimeLocation;
      entryIndex: number;
      type: TypeNode;
      access: "entry" | "value";
    }
  | { kind: "tuple"; parent: RuntimeLocation; index: number; type: TypeNode }
  | { kind: "string"; parent: RuntimeLocation; index: number };

export type RuntimeValue =
  | { kind: "int"; value: bigint }
  | { kind: "double"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "char"; value: string }
  | { kind: "string"; value: string }
  | { kind: "map"; type: MapTypeNode; entries: Array<{ key: RuntimeValue; value: RuntimeValue }> }
  | { kind: "pair"; type: PairTypeNode; first: RuntimeValue; second: RuntimeValue }
  | { kind: "tuple"; type: TupleTypeNode; values: RuntimeValue[] }
  | { kind: "array"; ref: number; type: VectorTypeNode | Exclude<TypeNode, PrimitiveTypeNode> }
  | { kind: "pointer"; pointeeType: TypeNode; target: RuntimeLocation | null }
  | { kind: "reference"; type: ReferenceTypeNode; target: RuntimeLocation }
  | { kind: "void" }
  | { kind: "uninitialized"; expectedType: TypeNode };

export function defaultValueForType(type: PrimitiveTypeNode): RuntimeValue {
  switch (type.name) {
    case "int":
    case "long long":
      return { kind: "int", value: 0n };
    case "bool":
      return { kind: "bool", value: false };
    case "double":
      return { kind: "double", value: 0 };
    case "char":
      return { kind: "char", value: "\0" };
    case "string":
      return { kind: "string", value: "" };
    case "void":
      return { kind: "void" };
  }
}

export function uninitializedForType(type: PrimitiveTypeNode): RuntimeValue {
  return { kind: "uninitialized", expectedType: type };
}

export function stringifyValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "1" : "0";
    case "double":
      return Number.isInteger(value.value)
        ? value.value.toFixed(1).replace(/\.0$/, "")
        : value.value.toString();
    case "char":
      return value.value;
    case "string":
      return value.value;
    case "pair":
      return `(${stringifyValue(value.first)}, ${stringifyValue(value.second)})`;
    case "map":
      return `{${value.entries
        .map((entry) => `${stringifyValue(entry.key)}: ${stringifyValue(entry.value)}`)
        .join(", ")}}`;
    case "tuple":
      return `(${value.values.map((element) => stringifyValue(element)).join(", ")})`;
    case "void":
      return "";
    case "array":
      return "<array>";
    case "pointer":
      return value.target === null ? "nullptr" : "<pointer>";
    case "reference":
      return "<reference>";
    case "uninitialized":
      return "<uninitialized>";
  }
}
