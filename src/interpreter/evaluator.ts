import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";
import {
  compareSortableValues,
  compareValues,
  sameLocation,
  toNumericOperands,
} from "@/stdlib/builtins/compare";
import { isTupleGetTemplateCall } from "@/stdlib/template-exprs";
import { mapValueType, tupleElementTypes, vectorElementType } from "@/stdlib/template-types";
import type {
  AssignTargetNode,
  BinaryExprNode,
  ExprNode,
  FunctionDeclNode,
  TemplateFunctionDeclNode,
  TypeNode,
} from "@/types";
import { isVectorType } from "@/types";
import {
  type EvalCtx,
  evaluateMethodCall,
  evaluateTemplateCall,
  tryEvaluateBuiltinCall,
} from "./builtin-eval";
import { inferTypeArgs, instantiateFunction } from "@/semantic/template-instantiator";
import { InterpreterRuntime } from "./runtime";

export type RuntimeArgument =
  | { kind: "value"; value: RuntimeValue }
  | { kind: "reference"; target: RuntimeLocation; type: TypeNode };

export abstract class InterpreterEvaluator extends InterpreterRuntime {
  private get evalCtx(): EvalCtx {
    return {
      evaluateExpr: (expr) => this.evaluateExpr(expr),
      fail: (msg, line) => this.fail(msg, line),
      expectInt: (v, line) => this.expectInt(v, line),
      expectBool: (v, line) => this.expectBool(v, line),
      expectArray: (v, line) => this.expectArray(v, line),
      ensureInitialized: (v, line, what) => this.ensureInitialized(v, line, what),
      ensureNotVoid: (v, line) =>
        this.ensureNotVoid(v as Exclude<RuntimeValue, { kind: "uninitialized" }>, line),
      castToElementType: (v, t, line) => this.castToElementType(v, t, line),
      runtimeValueToType: (v, line) => this.runtimeValueToType(v, line),
      defaultValueForType: (t, line) => this.defaultValueForType(t, line),
      isAssignableTarget: (expr): expr is AssignTargetNode => this.isAssignableTarget(expr),
      readAssignTarget: (target, line) =>
        this.readLocation(this.resolveAssignTargetLocation(target, line), line),
      writeAssignTarget: (target, value, line) =>
        this.writeLocation(this.resolveAssignTargetLocation(target, line), value, line),
      resolveAssignTargetLocation: (target, line) => this.resolveAssignTargetLocation(target, line),
      readLocation: (loc, line) => this.readLocation(loc, line),
      writeLocation: (loc, value, line) => this.writeLocation(loc, value, line),
      arrays: this.arrays,
      findOrInsertMapEntry: (mapValue, key, line) => this.findOrInsertMapEntry(mapValue, key, line),
    };
  }

  protected evaluateExpr(expr: ExprNode): RuntimeValue {
    this.step(expr, "expression");

    switch (expr.kind) {
      case "Literal":
        if (expr.valueType === "int") return { kind: "int", value: expr.value as bigint };
        if (expr.valueType === "double") return { kind: "double", value: expr.value as number };
        if (expr.valueType === "bool") return { kind: "bool", value: expr.value as boolean };
        if (expr.valueType === "char") return { kind: "char", value: expr.value as string };
        return { kind: "string", value: expr.value as string };
      case "Identifier":
        if (expr.name === "endl") return { kind: "string", value: "\n" };
        return this.resolve(expr.name, expr.line);
      case "TemplateIdExpr":
        return this.fail(`'${expr.template}' was not declared in this scope`, expr.line);
      case "AddressOfExpr": {
        const location = this.resolveAssignTargetLocation(expr.target, expr.line);
        return {
          kind: "pointer",
          pointeeType:
            location.kind === "string" ? { kind: "PrimitiveType", name: "char" } : location.type,
          target: location,
        };
      }
      case "DerefExpr": {
        const location = this.resolvePointerLocation(expr.pointer, expr.line);
        return this.readLocation(location, expr.line);
      }
      case "CallExpr": {
        const fn = this.functions.get(expr.callee);
        if (fn !== undefined) {
          const argValues: RuntimeArgument[] = expr.args.map((arg, index) => {
            const param = fn.params[index];
            if (param !== undefined && param.type.kind === "ReferenceType") {
              if (!this.isAssignableTarget(arg)) {
                this.fail("reference argument must be an lvalue", arg.line);
              }
              return {
                kind: "reference",
                target: this.resolveAssignTargetLocation(arg, arg.line),
                type: param.type.referredType,
              };
            }
            return { kind: "value", value: this.evaluateExpr(arg) };
          });
          return this.invokeFunction(fn, argValues);
        }
        const templateFn = this.templateFunctions.get(expr.callee);
        if (templateFn !== undefined) {
          return this.invokeTemplateFunction(templateFn, expr.args, expr.line);
        }
        const builtinResult = tryEvaluateBuiltinCall(
          expr.callee,
          expr.args,
          expr.line,
          this.evalCtx,
        );
        if (builtinResult !== null) {
          return builtinResult;
        }
        return this.fail(`'${expr.callee}' was not declared in this scope`, expr.line);
      }
      case "TemplateCallExpr":
        return evaluateTemplateCall(
          expr,
          this.evalCtx,
          (tupleExpr, index, line) => this.getTupleElementValue(tupleExpr, index, line),
          (type, args, line) => this.constructVectorValue(type, args, line),
        );
      case "MethodCallExpr":
        return evaluateMethodCall(expr.receiver, expr.method, expr.args, expr.line, this.evalCtx);
      case "IndexExpr":
        return this.getIndexedValue(expr.target, expr.index, expr.line);
      case "ConditionalExpr": {
        const condition = this.evaluateExpr(expr.condition);
        const selected = this.evaluateCondition(condition, expr.condition.line)
          ? this.evaluateExpr(expr.thenExpr)
          : this.evaluateExpr(expr.elseExpr);
        if (expr.resolvedType === null) {
          return selected;
        }
        return this.assertType(expr.resolvedType, selected, expr.line);
      }
      case "UnaryExpr": {
        if (expr.operator === "!") {
          const value = this.expectBool(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "bool", value: !value.value };
        }
        if (expr.operator === "-") {
          const value = this.ensureNotVoid(
            this.ensureInitialized(this.evaluateExpr(expr.operand), expr.line, "operand"),
            expr.line,
          );
          if (value.kind === "double") {
            return { kind: "double", value: -value.value };
          }
          const intValue = this.expectInt(value, expr.line);
          return { kind: "int", value: -intValue.value };
        }
        if (expr.operator === "~") {
          const value = this.expectInt(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "int", value: ~value.value };
        }
        if (!this.isAssignableTarget(expr.operand)) {
          this.fail("increment/decrement target must be a variable", expr.line);
        }
        const targetLocation = this.resolveAssignTargetLocation(expr.operand, expr.line);
        const currentValue = this.readLocation(targetLocation, expr.line);
        if (currentValue.kind === "pointer") {
          const pointerDelta = expr.operator === "++" ? 1n : -1n;
          const nextPointer = this.offsetPointer(currentValue, pointerDelta, expr.line);
          this.writeLocation(targetLocation, nextPointer, expr.line);
          return expr.isPostfix ? currentValue : nextPointer;
        }
        const delta = expr.operator === "++" ? 1n : -1n;
        const numericCurrent = this.expectInt(currentValue, expr.line);
        const numericUpdated: RuntimeValue =
          currentValue.kind === "char"
            ? this.intToChar(numericCurrent.value + delta, expr.line)
            : { kind: "int", value: numericCurrent.value + delta };
        this.writeLocation(targetLocation, numericUpdated, expr.line);
        return expr.isPostfix ? numericCurrent : numericUpdated;
      }
      case "BinaryExpr":
        return this.evaluateBinary(expr);
      case "AssignExpr": {
        const rightValue = this.ensureInitialized(this.evaluateExpr(expr.value), expr.line, "rhs");
        if (expr.target.kind === "Identifier") {
          const current = this.resolve(expr.target.name, expr.line);
          const assigned = this.resolveAssignedValue(expr.operator, current, rightValue, expr.line);
          this.assign(expr.target.name, assigned, expr.line);
          return assigned;
        }
        let assigned: RuntimeValue = rightValue;
        if (expr.operator !== "=") {
          const currentVal = this.readLocation(
            this.resolveAssignTargetLocation(expr.target, expr.line),
            expr.line,
          );
          assigned = this.resolveAssignedValue(expr.operator, currentVal, rightValue, expr.line);
        }
        this.writeLocation(
          this.resolveAssignTargetLocation(expr.target, expr.line),
          assigned,
          expr.line,
        );
        return assigned;
      }
    }
  }

  protected abstract invokeFunction(fn: FunctionDeclNode, args: RuntimeArgument[]): RuntimeValue;

  protected invokeTemplateFunction(
    templateFn: TemplateFunctionDeclNode,
    argExprs: import("@/types").ExprNode[],
    line: number,
  ): RuntimeValue {
    if (argExprs.length !== templateFn.params.length) {
      this.fail(`'${templateFn.name}' requires ${templateFn.params.length.toString()} arguments`, line);
    }
    const argValues: RuntimeArgument[] = argExprs.map((argExpr, index) => {
      const param = templateFn.params[index];
      if (param !== undefined && param.type.kind === "ReferenceType") {
        if (!this.isAssignableTarget(argExpr)) {
          this.fail("reference argument must be an lvalue", argExpr.line);
        }
        return {
          kind: "reference",
          target: this.resolveAssignTargetLocation(argExpr, argExpr.line),
          type: param.type.referredType,
        };
      }
      return { kind: "value", value: this.evaluateExpr(argExpr) };
    });

    const argTypes = argValues.map((a) =>
      a.kind === "value"
        ? this.runtimeValueToType(a.value, line)
        : a.type,
    );

    const map = inferTypeArgs(templateFn.typeParams, templateFn.params, argTypes);
    if (map === null) {
      this.fail(`cannot deduce template arguments for '${templateFn.name}'`, line);
    }

    const instantiated = instantiateFunction(templateFn, map);
    return this.invokeFunction(instantiated, argValues);
  }

  protected resolveAssignTargetLocation(target: AssignTargetNode, line: number): RuntimeLocation {
    switch (target.kind) {
      case "Identifier":
        return this.resolveBindingLocation(target.name, line);
      case "IndexExpr":
        return this.resolveIndexedLocation(target.target, target.index, line);
      case "DerefExpr":
        return this.resolvePointerLocation(target.pointer, line);
      case "TemplateCallExpr":
        return this.resolveTemplateCallLocation(target, line);
    }
  }

  protected isAssignableTarget(expr: ExprNode): expr is AssignTargetNode {
    return (
      expr.kind === "Identifier" ||
      expr.kind === "IndexExpr" ||
      expr.kind === "DerefExpr" ||
      isTupleGetTemplateCall(expr)
    );
  }

  private resolveTemplateCallLocation(
    expr: Extract<ExprNode, { kind: "TemplateCallExpr" }>,
    line: number,
  ): RuntimeLocation {
    if (expr.callee.template === "get") {
      const arg = expr.callee.templateArgs[0];
      if (arg === undefined || arg.kind !== "IntTemplateArg") {
        this.fail("get requires exactly 1 integer template argument and 1 value argument", line);
      }
      const tupleExpr = expr.args[0];
      if (tupleExpr === undefined || expr.args.length !== 1) {
        this.fail("get requires exactly 1 integer template argument and 1 value argument", line);
      }
      return this.resolveTupleElementLocation(tupleExpr, arg.value, line);
    }
    this.fail("template call is not assignable", line);
  }

  private resolvePointerLocation(pointerExpr: ExprNode, line: number): RuntimeLocation {
    const pointer = this.ensureInitialized(this.evaluateExpr(pointerExpr), line, "pointer");
    if (pointer.kind !== "pointer") {
      this.fail("type mismatch: expected pointer", line);
    }
    if (pointer.target === null) {
      this.fail("dereference of null pointer", line);
    }
    return pointer.target;
  }

  protected resolveIndexedLocation(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    line: number,
  ): RuntimeLocation {
    const targetValue = this.ensureInitialized(this.evaluateExpr(targetExpr), line, "value");
    if (targetValue.kind === "string") {
      const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
      if (
        targetExpr.kind !== "Identifier" &&
        targetExpr.kind !== "IndexExpr" &&
        targetExpr.kind !== "DerefExpr"
      ) {
        this.fail("string index target must be assignable", line);
      }
      return {
        kind: "string",
        parent: this.resolveAssignTargetLocation(targetExpr as AssignTargetNode, line),
        index: Number(index),
      };
    }
    if (targetValue.kind === "map") {
      if (
        targetExpr.kind !== "Identifier" &&
        targetExpr.kind !== "IndexExpr" &&
        targetExpr.kind !== "DerefExpr"
      ) {
        this.fail("map index target must be assignable", line);
      }
      const parent = this.resolveAssignTargetLocation(targetExpr as AssignTargetNode, line);
      const keyValue = this.ensureNotVoid(
        this.ensureInitialized(
          this.assertType(
            targetValue.type.templateArgs[0] ?? { kind: "PrimitiveType", name: "int" },
            this.evaluateExpr(indexExpr),
            line,
          ),
          line,
          "map key",
        ),
        line,
      );
      const entryIndex = this.findOrInsertMapEntry(targetValue, keyValue, line);
      return {
        kind: "map",
        parent,
        entryIndex,
        type: mapValueType(targetValue.type),
        access: "value",
      };
    }
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    const target = this.expectArray(targetValue, line);
    const store = this.arrays.get(target.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (index < 0n || index >= BigInt(store.values.length)) {
      this.fail(
        `index ${index.toString()} out of range for array of size ${store.values.length}`,
        line,
      );
    }
    return {
      kind: "array",
      ref: target.ref,
      index: Number(index),
      type: isVectorType(store.type) ? vectorElementType(store.type) : store.type.elementType,
    };
  }

  private resolveTupleElementLocation(
    tupleExpr: ExprNode,
    index: number,
    line: number,
  ): RuntimeLocation {
    if (!this.isAssignableTarget(tupleExpr)) {
      this.fail("tuple get target must be assignable", line);
    }
    const parent = this.resolveAssignTargetLocation(tupleExpr, line);
    const tupleValue = this.readLocation(parent, line);
    if (tupleValue.kind !== "tuple") {
      this.fail("type mismatch: expected tuple", line);
    }
    const elementType = tupleElementTypes(tupleValue.type)[index];
    if (elementType === undefined) {
      this.fail(
        `tuple index ${index.toString()} out of range for tuple of size ${tupleValue.values.length}`,
        line,
      );
    }
    return { kind: "tuple", parent, index, type: elementType };
  }

  protected getTupleElementValue(tupleExpr: ExprNode, index: number, line: number): RuntimeValue {
    const tupleValue = this.ensureInitialized(this.evaluateExpr(tupleExpr), line, "tuple");
    if (tupleValue.kind !== "tuple") {
      this.fail("type mismatch: expected tuple", line);
    }
    const elementValue = tupleValue.values[index];
    if (elementValue === undefined) {
      this.fail(
        `tuple index ${index.toString()} out of range for tuple of size ${tupleValue.values.length}`,
        line,
      );
    }
    return this.ensureNotVoid(this.ensureInitialized(elementValue, line, "tuple element"), line);
  }

  protected getIndexedValue(targetExpr: ExprNode, indexExpr: ExprNode, line: number): RuntimeValue {
    return this.readLocation(this.resolveIndexedLocation(targetExpr, indexExpr, line), line);
  }

  protected setIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    value: RuntimeValue,
    line: number,
  ): void {
    this.writeLocation(this.resolveIndexedLocation(targetExpr, indexExpr, line), value, line);
  }

  private evaluateBinary(expr: BinaryExprNode): RuntimeValue {
    if (expr.operator === "&&") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (!left.value) return { kind: "bool", value: false };
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    if (expr.operator === "||") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (left.value) return { kind: "bool", value: true };
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    const left = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.left), expr.line, "left operand"),
      expr.line,
    );
    const right = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.right), expr.line, "right operand"),
      expr.line,
    );

    if (expr.operator === "+" && left.kind === "string" && right.kind === "string") {
      return { kind: "string", value: left.value + right.value };
    }

    if (
      expr.operator === "==" ||
      expr.operator === "!=" ||
      expr.operator === "<" ||
      expr.operator === "<=" ||
      expr.operator === ">" ||
      expr.operator === ">="
    ) {
      return {
        kind: "bool",
        value: compareValues(left, right, expr.operator, expr.line, this.fail.bind(this)),
      };
    }

    if (
      expr.operator === "<<" ||
      expr.operator === ">>" ||
      expr.operator === "&" ||
      expr.operator === "^" ||
      expr.operator === "|"
    ) {
      const leftInt = this.expectInt(left, expr.line);
      const rightInt = this.expectInt(right, expr.line);
      switch (expr.operator) {
        case "<<":
          return {
            kind: "int",
            value: leftInt.value << this.normalizeShiftAmount(rightInt.value, expr.line),
          };
        case ">>":
          return {
            kind: "int",
            value: leftInt.value >> this.normalizeShiftAmount(rightInt.value, expr.line),
          };
        case "&":
          return { kind: "int", value: leftInt.value & rightInt.value };
        case "^":
          return { kind: "int", value: leftInt.value ^ rightInt.value };
        case "|":
          return { kind: "int", value: leftInt.value | rightInt.value };
      }
    }

    const pointerResult = this.tryEvaluatePointerArithmetic(expr.operator, left, right, expr.line);
    if (pointerResult !== null) {
      return pointerResult;
    }

    const numeric = toNumericOperands(left, right, expr.line, this.fail.bind(this));
    if (numeric.mode === "double") {
      switch (expr.operator) {
        case "+":
          return { kind: "double", value: numeric.left + numeric.right };
        case "-":
          return { kind: "double", value: numeric.left - numeric.right };
        case "*":
          return { kind: "double", value: numeric.left * numeric.right };
        case "/":
          return { kind: "double", value: numeric.left / numeric.right };
        case "%":
          return { kind: "double", value: numeric.left % numeric.right };
        default:
          this.fail(`unsupported binary operator '${expr.operator}'`, expr.line);
      }
    }

    switch (expr.operator) {
      case "+":
        return { kind: "int", value: numeric.left + numeric.right };
      case "-":
        return { kind: "int", value: numeric.left - numeric.right };
      case "*":
        return { kind: "int", value: numeric.left * numeric.right };
      case "/":
        if (numeric.right === 0n) this.fail("division by zero", expr.line);
        return { kind: "int", value: numeric.left / numeric.right };
      case "%":
        if (numeric.right === 0n) this.fail("division by zero", expr.line);
        return { kind: "int", value: numeric.left % numeric.right };
      default:
        this.fail(`unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private normalizeShiftAmount(value: bigint, line: number): bigint {
    if (value < 0n) this.fail("shift count must be non-negative", line);
    return value;
  }

  private tryEvaluatePointerArithmetic(
    operator: BinaryExprNode["operator"],
    left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
    right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
    line: number,
  ): RuntimeValue | null {
    if (operator === "+") {
      if (left.kind === "pointer" && right.kind === "int")
        return this.offsetPointer(left, right.value, line);
      if (left.kind === "int" && right.kind === "pointer")
        return this.offsetPointer(right, left.value, line);
      return null;
    }
    if (operator === "-") {
      if (left.kind === "pointer" && right.kind === "int")
        return this.offsetPointer(left, -right.value, line);
      if (left.kind === "pointer" && right.kind === "pointer") {
        return { kind: "int", value: this.diffPointers(left, right, line) };
      }
      return null;
    }
    return null;
  }

  private offsetPointer(
    pointer: Extract<RuntimeValue, { kind: "pointer" }>,
    offset: bigint,
    line: number,
  ): RuntimeValue {
    if (pointer.target === null) this.fail("pointer arithmetic on null pointer", line);
    const target = pointer.target;
    if (target.kind === "array") {
      return {
        kind: "pointer",
        pointeeType: pointer.pointeeType,
        target: {
          kind: "array",
          ref: target.ref,
          index: target.index + Number(offset),
          type: target.type,
        },
      };
    }
    if (target.kind === "string") {
      return {
        kind: "pointer",
        pointeeType: pointer.pointeeType,
        target: { kind: "string", parent: target.parent, index: target.index + Number(offset) },
      };
    }
    if (offset === 0n) return pointer;
    this.fail("pointer arithmetic requires pointer to array/string element", line);
  }

  private diffPointers(
    left: Extract<RuntimeValue, { kind: "pointer" }>,
    right: Extract<RuntimeValue, { kind: "pointer" }>,
    line: number,
  ): bigint {
    if (left.target === null || right.target === null) {
      this.fail("pointer subtraction requires non-null pointers", line);
    }
    const l = left.target;
    const r = right.target;
    if (l.kind === "array" && r.kind === "array") {
      if (l.ref !== r.ref)
        this.fail("pointer subtraction requires pointers into the same array", line);
      return BigInt(l.index - r.index);
    }
    if (l.kind === "string" && r.kind === "string") {
      if (!sameLocation(l.parent, r.parent)) {
        this.fail("pointer subtraction requires pointers into the same string", line);
      }
      return BigInt(l.index - r.index);
    }
    this.fail("pointer subtraction requires compatible pointers", line);
  }

  private resolveAssignedValue(
    operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=",
    current: RuntimeValue,
    rightValue: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (operator === "=") {
      return this.assignWithCurrentType(current, rightValue, line);
    }
    if (current.kind === "pointer") {
      if (operator !== "+=" && operator !== "-=") {
        this.fail("type mismatch: expected numeric", line);
      }
      const delta = this.expectInt(rightValue, line).value;
      return this.offsetPointer(current, operator === "+=" ? delta : -delta, line);
    }
    const left = this.expectInt(current, line);
    const right = this.expectInt(rightValue, line);
    return this.applyCompoundAssign(operator, left.value, right.value, line);
  }

  private applyCompoundAssign(
    operator: "+=" | "-=" | "*=" | "/=" | "%=",
    left: bigint,
    right: bigint,
    line: number,
  ): RuntimeValue {
    switch (operator) {
      case "+=":
        return { kind: "int", value: left + right };
      case "-=":
        return { kind: "int", value: left - right };
      case "*=":
        return { kind: "int", value: left * right };
      case "/=":
        if (right === 0n) this.fail("division by zero", line);
        return { kind: "int", value: left / right };
      case "%=":
        if (right === 0n) this.fail("division by zero", line);
        return { kind: "int", value: left % right };
    }
  }

  protected findOrInsertMapEntry(
    mapValue: Extract<RuntimeValue, { kind: "map" }>,
    key: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
    line: number,
  ): number {
    const existingIndex = mapValue.entries.findIndex((entry) =>
      compareValues(
        this.ensureComparableMapKey(entry.key, line),
        key,
        "==",
        line,
        this.fail.bind(this),
      ),
    );
    if (existingIndex >= 0) {
      return existingIndex;
    }
    const valueType = mapValueType(mapValue.type);
    const nextEntry = {
      key,
      value: this.defaultValueForType(valueType, line),
    };
    mapValue.entries.push(nextEntry);
    mapValue.entries.sort((l, r) =>
      compareSortableValues(
        this.ensureComparableMapKey(l.key, line),
        this.ensureComparableMapKey(r.key, line),
        false,
        line,
        this.fail.bind(this),
      ),
    );
    return mapValue.entries.findIndex((entry) =>
      compareValues(
        this.ensureComparableMapKey(entry.key, line),
        key,
        "==",
        line,
        this.fail.bind(this),
      ),
    );
  }

  private ensureComparableMapKey(
    value: RuntimeValue,
    line: number,
  ): Exclude<RuntimeValue, { kind: "void" | "uninitialized" }> {
    return this.ensureNotVoid(this.ensureInitialized(value, line, "map key"), line);
  }
}
