import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";
import type { ArrayTypeNode, ExprNode, TypeNode } from "@/types";
import { isMapType, pairType } from "@/types";
import type { Scope } from "./core";
import { InterpreterRuntimeTypeSupport } from "./type-support";

export abstract class InterpreterRuntimeSupport extends InterpreterRuntimeTypeSupport {
  protected override defineInScope(
    scope: Scope,
    name: string,
    value: RuntimeValue,
    line: number,
  ): void {
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
    if (current.kind === "map") {
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

  protected createFixedArrayValue(
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

  protected applyArrayInitializers(
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

  protected flattenArrayElements(
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
      case "map": {
        const parent = this.readLocation(location.parent, line);
        if (parent.kind !== "map") {
          this.fail("type mismatch: expected map", line);
        }
        const entry = parent.entries[location.entryIndex];
        if (entry === undefined) {
          this.fail("invalid map entry access", line);
        }
        if (location.access === "entry") {
          return {
            kind: "pair",
            type: isMapType(parent.type)
              ? pairType(parent.type.keyType, parent.type.valueType)
              : (location.type as ReturnType<typeof pairType>),
            first: entry.key,
            second: entry.value.kind === "reference" ? this.readLocation(entry.value.target, line) : entry.value,
          };
        }
        return entry.value.kind === "reference"
          ? this.readLocation(entry.value.target, line)
          : entry.value;
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
        return { kind: "char", value: parent.value[location.index] ?? "\0" };
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
      case "map": {
        const current = this.readLocation(location.parent, line);
        if (current.kind !== "map") {
          this.fail("type mismatch: expected map", line);
        }
        const entry = current.entries[location.entryIndex];
        if (entry === undefined) {
          this.fail("invalid map entry access", line);
        }
        const nextEntries = current.entries.map((candidate, index) => {
          if (index !== location.entryIndex) {
            return candidate;
          }
          if (location.access === "entry") {
            const assigned = this.assertType(location.type, value, line);
            if (assigned.kind !== "pair") {
              this.fail("map entry assignment requires pair", line);
            }
            return {
              key: this.assertType(current.type.keyType, assigned.first, line),
              value: this.assertType(current.type.valueType, assigned.second, line),
            };
          }
          return {
            key: candidate.key,
            value: this.assertType(location.type, value, line),
          };
        });
        this.writeLocation(
          location.parent,
          {
            kind: "map",
            type: current.type,
            entries: nextEntries,
          },
          line,
        );
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
        const assigned = this.assertType({ kind: "PrimitiveType", name: "char" }, value, line);
        if (assigned.kind !== "char") {
          this.fail("string element assignment requires char", line);
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
      case "char":
        return { kind: "PrimitiveType", name: "char" };
      case "string":
        return { kind: "PrimitiveType", name: "string" };
      case "pair":
        return value.type;
      case "map":
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
