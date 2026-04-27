import type { RuntimeValue } from "@/runtime/value";
import { stringifyValue } from "@/runtime/value";
import type { DebugValueView, TypeNode } from "@/types";
import {
  isArrayType,
  isMapType,
  isPairType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTupleType,
  isVectorType,
  typeToString,
} from "@/types";
import type { Scope } from "./core";
import { InterpreterRuntimeCore } from "./core";

export abstract class InterpreterRuntimeTypeSupport extends InterpreterRuntimeCore {
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
      if (type.name === "char") {
        return { kind: "char", value: "\0" };
      }
      if (type.name === "string") {
        return { kind: "string", value: "" };
      }
      this.fail("element type cannot be void", line);
    }
    if (isVectorType(type)) {
      return this.allocateArray(type, []);
    }
    if (isMapType(type)) {
      return {
        kind: "map",
        type,
        entries: [],
      };
    }
    if (isPairType(type)) {
      return {
        kind: "pair",
        type,
        first: this.defaultValueForType(type.firstType, line),
        second: this.defaultValueForType(type.secondType, line),
      };
    }
    if (isTupleType(type)) {
      return {
        kind: "tuple",
        type,
        values: type.elementTypes.map((elementType) => this.defaultValueForType(elementType, line)),
      };
    }
    this.fail("fixed array value requires dimensions", line);
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

    if (isPairType(type)) {
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

    if (isMapType(type)) {
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      if (value.kind !== "map") {
        this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
      }
      return {
        kind: "map",
        type,
        entries: value.entries.map((entry) => ({
          key: this.assertType(type.keyType, entry.key, line),
          value: this.assertType(type.valueType, entry.value, line),
        })),
      };
    }

    if (isTupleType(type)) {
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

    if (isVectorType(type) && !isVectorType(value.type)) {
      this.fail("cannot convert 'array' to 'vector'", line);
    }

    if (isArrayType(type) && !isArrayType(value.type)) {
      this.fail("cannot convert 'vector' to 'array'", line);
    }

    if (
      (isArrayType(type) || isVectorType(type)) &&
      (isArrayType(value.type) || isVectorType(value.type)) &&
      !this.sameType(type.elementType, value.type.elementType)
    ) {
      this.fail(
        `cannot convert '${this.typeToRuntimeString(value.type)}' to '${this.typeToRuntimeString(type)}'`,
        line,
      );
    }

    return value;
  }

  protected override typeKindName(type: TypeNode): string {
    if (isPrimitiveType(type)) {
      return type.name;
    }
    if (isArrayType(type)) return "array";
    if (isVectorType(type)) return "vector";
    if (isMapType(type)) return "map";
    if (isPairType(type)) return "pair";
    if (isTupleType(type)) return "tuple";
    if (isPointerType(type)) return "pointer";
    return "reference";
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
        return `<${isVectorType(value.type) ? "vector" : "array"}#${value.ref}>`;
      case "pointer":
        return value.target === null ? "nullptr" : `<pointer:${typeToString(value.pointeeType)}>`;
      case "reference":
        return this.serializeValue(this.readLocation(value.target, this.currentLine));
      case "uninitialized":
        return `<uninitialized:${typeToString(value.expectedType)}>`;
      case "pair":
        return `(${this.serializeValue(value.first)}, ${this.serializeValue(value.second)})`;
      case "map":
        return `{${value.entries
          .map((entry) => `${this.serializeValue(entry.key)}: ${this.serializeValue(entry.value)}`)
          .join(", ")}}`;
      case "tuple":
        return `(${value.values.map((element) => this.serializeValue(element)).join(", ")})`;
      case "bool":
        return value.value ? "true" : "false";
      default:
        return stringifyValue(value);
    }
  }

  protected coerceRuntimeValue(
    expected: "int" | "double" | "bool" | "char" | "string",
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
    if (expected === "double" && initialized.kind === "char") {
      return { kind: "double", value: Number(initialized.value.codePointAt(0) ?? 0) };
    }
    if (expected === "int" && initialized.kind === "double") {
      if (!Number.isFinite(initialized.value) || !Number.isInteger(initialized.value)) {
        this.fail("cannot convert 'double' to 'int'", line);
      }
      return { kind: "int", value: BigInt(initialized.value) };
    }
    if (expected === "int" && initialized.kind === "char") {
      return { kind: "int", value: BigInt(initialized.value.codePointAt(0) ?? 0) };
    }
    if (expected === "char" && initialized.kind === "int") {
      return this.intToChar(initialized.value, line);
    }
    if (expected === "char" && initialized.kind === "double") {
      if (!Number.isFinite(initialized.value) || !Number.isInteger(initialized.value)) {
        this.fail("cannot convert 'double' to 'char'", line);
      }
      return this.intToChar(BigInt(initialized.value), line);
    }
    if (expected === "char" && initialized.kind === "string") {
      if (Array.from(initialized.value).length !== 1) {
        this.fail("cannot convert 'string' to 'char'", line);
      }
      return { kind: "char", value: initialized.value };
    }
    if (expected === "string" && initialized.kind === "char") {
      return { kind: "string", value: initialized.value };
    }
    this.fail(`cannot convert '${initialized.kind}' to '${expected}'`, line);
  }

  protected sameType(left: TypeNode, right: TypeNode): boolean {
    if (isPrimitiveType(left) || isPrimitiveType(right)) {
      return isPrimitiveType(left) && isPrimitiveType(right) && left.name === right.name;
    }
    if (isArrayType(left) || isArrayType(right)) {
      return isArrayType(left) && isArrayType(right) && this.sameType(left.elementType, right.elementType);
    }
    if (isVectorType(left) || isVectorType(right)) {
      return isVectorType(left) && isVectorType(right) && this.sameType(left.elementType, right.elementType);
    }
    if (isMapType(left) || isMapType(right)) {
      return (
        isMapType(left) &&
        isMapType(right) &&
        this.sameType(left.keyType, right.keyType) &&
        this.sameType(left.valueType, right.valueType)
      );
    }
    if (isPairType(left) || isPairType(right)) {
      return (
        isPairType(left) &&
        isPairType(right) &&
        this.sameType(left.firstType, right.firstType) &&
        this.sameType(left.secondType, right.secondType)
      );
    }
    if (isTupleType(left) || isTupleType(right)) {
      return (
        isTupleType(left) &&
        isTupleType(right) &&
        left.elementTypes.length === right.elementTypes.length &&
        left.elementTypes.every((elementType, index) => {
          const rightElementType = right.elementTypes[index];
          return rightElementType !== undefined && this.sameType(elementType, rightElementType);
        })
      );
    }
    if (isPointerType(left) || isPointerType(right)) {
      return isPointerType(left) && isPointerType(right) && this.sameType(left.pointeeType, right.pointeeType);
    }
    return (
      isReferenceType(left) &&
      isReferenceType(right) &&
      this.sameType(left.referredType, right.referredType)
    );
  }

  protected typeToRuntimeString(type: TypeNode): string {
    return typeToString(type);
  }
}
