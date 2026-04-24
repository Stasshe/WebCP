import type { PrimitiveTypeName } from "../types";

export type RuntimeValue =
  | { kind: "int"; value: bigint }
  | { kind: "bool"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "void" }
  | { kind: "uninitialized"; expected: "int" | "bool" | "string" };

export function defaultValueForType(typeName: PrimitiveTypeName): RuntimeValue {
  switch (typeName) {
    case "int":
    case "long long":
      return { kind: "int", value: 0n };
    case "bool":
      return { kind: "bool", value: false };
    case "string":
      return { kind: "string", value: "" };
    case "void":
      return { kind: "void" };
  }
}

export function uninitializedForType(typeName: PrimitiveTypeName): RuntimeValue {
  if (typeName === "void") {
    return { kind: "void" };
  }
  if (typeName === "long long") {
    return { kind: "uninitialized", expected: "int" };
  }
  return { kind: "uninitialized", expected: typeName };
}

export function stringifyValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "1" : "0";
    case "string":
      return value.value;
    case "void":
      return "";
    case "uninitialized":
      return "<uninitialized>";
  }
}
