import type { RuntimeLocation, RuntimeValue } from "../runtime/value";
import type { AssignTargetNode, BinaryExprNode, ExprNode, FunctionDeclNode } from "../types";
import { isReferenceType } from "../types";
import { InterpreterRuntime } from "./interpreter-runtime";

export type RuntimeArgument =
  | { kind: "value"; value: RuntimeValue }
  | { kind: "reference"; target: RuntimeLocation; type: import("../types").TypeNode };

export abstract class InterpreterEvaluator extends InterpreterRuntime {
  protected evaluateExpr(expr: ExprNode): RuntimeValue {
    this.step(expr, "expression");

    switch (expr.kind) {
      case "Literal":
        if (expr.valueType === "int") {
          return { kind: "int", value: expr.value as bigint };
        }
        if (expr.valueType === "double") {
          return { kind: "double", value: expr.value as number };
        }
        if (expr.valueType === "bool") {
          return { kind: "bool", value: expr.value as boolean };
        }
        return { kind: "string", value: expr.value as string };
      case "Identifier":
        if (expr.name === "endl") {
          return { kind: "string", value: "\n" };
        }
        return this.resolve(expr.name, expr.line);
      case "AddressOfExpr": {
        const location = this.resolveAssignTargetLocation(expr.target, expr.line);
        return { kind: "pointer", pointeeType: location.kind === "string" ? { kind: "PrimitiveType", name: "string" } : location.type, target: location };
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
            if (param !== undefined && isReferenceType(param.type)) {
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
        const builtinResult = this.tryEvaluateBuiltinCall(expr.callee, expr.args, expr.line);
        if (builtinResult !== null) {
          return builtinResult;
        }
        return this.fail(`'${expr.callee}' was not declared in this scope`, expr.line);
      }
      case "MethodCallExpr":
        return this.evaluateMethodCall(expr.receiver, expr.method, expr.args, expr.line);
      case "IndexExpr":
        return this.getIndexedValue(expr.target, expr.index, expr.line);
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
        const current = this.expectInt(this.readLocation(this.resolveAssignTargetLocation(expr.operand, expr.line), expr.line), expr.line);
        const delta = expr.operator === "++" ? 1n : -1n;
        const updated: RuntimeValue = { kind: "int", value: current.value + delta };
        this.writeLocation(this.resolveAssignTargetLocation(expr.operand, expr.line), updated, expr.line);
        return expr.isPostfix ? current : updated;
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
          const currentIndexValue = this.readLocation(
            this.resolveAssignTargetLocation(expr.target, expr.line),
            expr.line,
          );
          assigned = this.resolveAssignedValue(
            expr.operator,
            currentIndexValue,
            rightValue,
            expr.line,
          );
        }
        this.writeLocation(this.resolveAssignTargetLocation(expr.target, expr.line), assigned, expr.line);
        return assigned;
      }
    }
  }

  protected abstract invokeFunction(fn: FunctionDeclNode, args: RuntimeArgument[]): RuntimeValue;
  protected resolveAssignTargetLocation(target: AssignTargetNode, line: number): RuntimeLocation {
    switch (target.kind) {
      case "Identifier":
        return this.resolveBindingLocation(target.name, line);
      case "IndexExpr":
        return this.resolveIndexedLocation(target.target, target.index, line);
      case "DerefExpr":
        return this.resolvePointerLocation(target.pointer, line);
    }
  }

  private isAssignableTarget(expr: ExprNode): expr is AssignTargetNode {
    return expr.kind === "Identifier" || expr.kind === "IndexExpr" || expr.kind === "DerefExpr";
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

  private resolveIndexedLocation(targetExpr: ExprNode, indexExpr: ExprNode, line: number): RuntimeLocation {
    const targetValue = this.ensureInitialized(this.evaluateExpr(targetExpr), line, "value");
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    if (targetValue.kind === "string") {
      if (targetExpr.kind !== "Identifier" && targetExpr.kind !== "IndexExpr" && targetExpr.kind !== "DerefExpr") {
        this.fail("string index target must be assignable", line);
      }
      return {
        kind: "string",
        parent: this.resolveAssignTargetLocation(targetExpr as AssignTargetNode, line),
        index: Number(index),
      };
    }
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
      type: store.type.elementType,
    };
  }

  private tryEvaluateBuiltinCall(
    callee: string,
    args: ExprNode[],
    line: number,
  ): RuntimeValue | null {
    if (callee === "abs") {
      if (args.length !== 1) {
        this.fail("abs requires exactly 1 argument", line);
      }
      const value = this.expectInt(this.evaluateExpr(args[0] as ExprNode), line).value;
      return { kind: "int", value: value < 0n ? -value : value };
    }

    if (callee === "max" || callee === "min") {
      if (args.length !== 2) {
        this.fail(`${callee} requires exactly 2 arguments`, line);
      }
      const left = this.expectInt(this.evaluateExpr(args[0] as ExprNode), line).value;
      const right = this.expectInt(this.evaluateExpr(args[1] as ExprNode), line).value;
      return {
        kind: "int",
        value: callee === "max" ? (left > right ? left : right) : left < right ? left : right,
      };
    }

    if (callee === "swap") {
      if (args.length !== 2) {
        this.fail("swap requires exactly 2 arguments", line);
      }
      const left = args[0];
      const right = args[1];
      if (
        left === undefined ||
        right === undefined ||
        (left.kind !== "Identifier" && left.kind !== "IndexExpr") ||
        (right.kind !== "Identifier" && right.kind !== "IndexExpr")
      ) {
        this.fail("swap arguments must be lvalues", line);
      }
      const leftValue = this.readAssignTarget(left, line);
      const rightValue = this.readAssignTarget(right, line);
      this.writeAssignTarget(left, rightValue, line);
      this.writeAssignTarget(right, leftValue, line);
      return { kind: "void" };
    }

    if (callee === "sort") {
      this.applyRangeBuiltin("sort", args, line);
      return { kind: "void" };
    }

    if (callee === "reverse") {
      this.applyRangeBuiltin("reverse", args, line);
      return { kind: "void" };
    }

    if (callee === "fill") {
      this.applyRangeBuiltin("fill", args, line);
      return { kind: "void" };
    }

    return null;
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
    const left = this.expectInt(current, line);
    const right = this.expectInt(rightValue, line);
    return this.applyCompoundAssign(operator, left.value, right.value, line);
  }

  private evaluateMethodCall(
    receiverExpr: ExprNode,
    method: string,
    args: ExprNode[],
    line: number,
  ): RuntimeValue {
    const receiver = this.evaluateExpr(receiverExpr);
    const arrayValue = this.expectArray(receiver, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (store.type.kind !== "VectorType") {
      this.fail(`method '${method}' is not supported for fixed array`, line);
    }

    if (method === "push_back") {
      if (args.length !== 1) {
        this.fail("push_back requires exactly 1 argument", line);
      }
      const value = this.castToElementType(
        this.evaluateExpr(args[0] as ExprNode),
        store.type.elementType,
        line,
      );
      store.values.push(value);
      return { kind: "void" };
    }

    if (method === "pop_back") {
      if (args.length !== 0) {
        this.fail("pop_back requires no arguments", line);
      }
      if (store.values.length === 0) {
        this.fail("pop_back on empty vector", line);
      }
      store.values.pop();
      return { kind: "void" };
    }

    if (method === "size") {
      if (args.length !== 0) {
        this.fail("size requires no arguments", line);
      }
      return { kind: "int", value: BigInt(store.values.length) };
    }

    if (method === "back") {
      if (args.length !== 0) {
        this.fail("back requires no arguments", line);
      }
      const last = store.values[store.values.length - 1];
      if (last === undefined) {
        this.fail("back on empty vector", line);
      }
      return last;
    }

    if (method === "empty") {
      if (args.length !== 0) {
        this.fail("empty requires no arguments", line);
      }
      return { kind: "bool", value: store.values.length === 0 };
    }

    if (method === "clear") {
      if (args.length !== 0) {
        this.fail("clear requires no arguments", line);
      }
      store.values = [];
      return { kind: "void" };
    }

    if (method === "resize") {
      if (args.length !== 1) {
        this.fail("resize requires exactly 1 argument", line);
      }
      const newSize = this.expectInt(this.evaluateExpr(args[0] as ExprNode), line).value;
      if (newSize < 0n) {
        this.fail("resize size must be non-negative", line);
      }
      const targetSize = Number(newSize);
      if (targetSize < store.values.length) {
        store.values = store.values.slice(0, targetSize);
      } else {
        while (store.values.length < targetSize) {
          store.values.push(this.defaultValueForType(store.type.elementType, line));
        }
      }
      return { kind: "void" };
    }

    this.fail(`unknown vector method '${method}'`, line);
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
      if (!left.value) {
        return { kind: "bool", value: false };
      }
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    if (expr.operator === "||") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (left.value) {
        return { kind: "bool", value: true };
      }
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
        if (numeric.right === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: numeric.left / numeric.right };
      case "%":
        if (numeric.right === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: numeric.left % numeric.right };
      default:
        this.fail(`unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private normalizeShiftAmount(value: bigint, line: number): bigint {
    if (value < 0n) {
      this.fail("shift count must be non-negative", line);
    }
    return value;
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
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left / right };
      case "%=":
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left % right };
    }
  }

  private applyRangeBuiltin(
    callee: "sort" | "reverse" | "fill",
    args: ExprNode[],
    line: number,
  ): void {
    const range = this.expectVectorRange(args, callee, line);
    const store = range.store;

    if (callee === "reverse") {
      store.values.reverse();
      return;
    }

    if (callee === "fill") {
      const fillArg = args[2];
      if (fillArg === undefined) {
        this.fail("fill requires exactly 3 arguments", line);
      }
      const fillValue = this.castToElementType(
        this.evaluateExpr(fillArg),
        store.type.elementType,
        line,
      );
      store.values = store.values.map(() => fillValue);
      return;
    }

    const descending = this.isDescendingSortComparator(args[2], line);
    store.values.sort((left, right) =>
      compareSortableValues(left, right, descending, line, this.fail.bind(this)),
    );
  }

  private expectVectorRange(
    args: ExprNode[],
    callee: "sort" | "reverse" | "fill",
    line: number,
  ): {
    store: {
      values: RuntimeValue[];
      type: { kind: "VectorType"; elementType: import("../types").TypeNode };
    };
  } {
    const minArgs = callee === "fill" ? 3 : 2;
    const maxArgs = callee === "sort" ? 3 : callee === "fill" ? 3 : 2;
    if (args.length < minArgs || args.length > maxArgs) {
      this.fail(
        `${callee} requires ${callee === "sort" ? "2 or 3" : callee === "fill" ? "exactly 3" : "exactly 2"} arguments`,
        line,
      );
    }

    const beginExpr = args[0];
    const endExpr = args[1];
    if (
      beginExpr === undefined ||
      endExpr === undefined ||
      beginExpr.kind !== "MethodCallExpr" ||
      endExpr.kind !== "MethodCallExpr"
    ) {
      this.fail(`${callee} requires vector begin/end iterators`, line);
    }
    if (
      beginExpr.method !== "begin" ||
      endExpr.method !== "end" ||
      beginExpr.args.length !== 0 ||
      endExpr.args.length !== 0
    ) {
      this.fail(`${callee} requires vector begin/end iterators`, line);
    }
    if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
      this.fail(`${callee} requires iterators from the same vector`, line);
    }

    const receiver = this.evaluateExpr(beginExpr.receiver);
    const arrayValue = this.expectArray(receiver, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (store.type.kind !== "VectorType") {
      this.fail(`${callee} requires a vector range`, line);
    }

    return {
      store: store as {
        values: RuntimeValue[];
        type: { kind: "VectorType"; elementType: import("../types").TypeNode };
      },
    };
  }

  private isDescendingSortComparator(expr: ExprNode | undefined, line: number): boolean {
    if (expr === undefined) {
      return false;
    }
    if (expr.kind === "CallExpr" && expr.callee === "greater" && expr.args.length === 0) {
      return true;
    }
    this.fail("unsupported sort comparator", line);
  }
}

function compareValues(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
  line: number,
  fail: (message: string, line: number) => never,
): boolean {
  if (isNumericRuntimeValue(left) && isNumericRuntimeValue(right)) {
    const operands = toNumericOperands(left, right, line, fail);
    return comparePrimitive(operands.left, operands.right, operator);
  }

  if (left.kind !== right.kind) {
    fail("type mismatch in comparison", line);
  }

  switch (left.kind) {
    case "int":
      return comparePrimitive(
        left.value,
        (right as { kind: "int"; value: bigint }).value,
        operator,
      );
    case "double":
      return comparePrimitive(
        left.value,
        (right as { kind: "double"; value: number }).value,
        operator,
      );
    case "bool":
      return comparePrimitive(
        left.value,
        (right as { kind: "bool"; value: boolean }).value,
        operator,
      );
    case "string":
      return comparePrimitive(
        left.value,
        (right as { kind: "string"; value: string }).value,
        operator,
      );
    case "pointer":
      return comparePrimitive(
        left.target,
        (right as { kind: "pointer"; target: RuntimeLocation | null }).target,
        operator,
      );
    case "array":
      fail("array comparison is not supported", line);
    case "reference":
      fail("reference comparison is not supported", line);
  }
}

function isNumericRuntimeValue(
  value: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
): value is Extract<RuntimeValue, { kind: "int" | "double" }> {
  return value.kind === "int" || value.kind === "double";
}

function toNumericOperands(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  line: number,
  fail: (message: string, line: number) => never,
): { mode: "int"; left: bigint; right: bigint } | { mode: "double"; left: number; right: number } {
  if (!isNumericRuntimeValue(left) || !isNumericRuntimeValue(right)) {
    fail("type mismatch: expected numeric", line);
  }
  if (left.kind === "double" || right.kind === "double") {
    return {
      mode: "double",
      left: left.kind === "double" ? left.value : Number(left.value),
      right: right.kind === "double" ? right.value : Number(right.value),
    };
  }
  return { mode: "int", left: left.value, right: right.value };
}

function comparePrimitive<T extends bigint | number | boolean | string>(
  left: T,
  right: T,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean;
function comparePrimitive(
  left: RuntimeLocation | null,
  right: RuntimeLocation | null,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean;
function comparePrimitive<T extends bigint | number | boolean | string>(
  left: T | RuntimeLocation | null,
  right: T | RuntimeLocation | null,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean {
  if (left === null || right === null || typeof left === "object" || typeof right === "object") {
    const equal = sameLocation(left as RuntimeLocation | null, right as RuntimeLocation | null);
    switch (operator) {
      case "==":
        return equal;
      case "!=":
        return !equal;
      default:
        return false;
    }
  }
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function sameLocation(left: RuntimeLocation | null, right: RuntimeLocation | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "binding":
      return right.kind === "binding" && left.scope === right.scope && left.name === right.name;
    case "array":
      return right.kind === "array" && left.ref === right.ref && left.index === right.index;
    case "string":
      return right.kind === "string" && left.index === right.index && sameLocation(left.parent, right.parent);
  }
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "Identifier":
      return right.kind === "Identifier" && left.name === right.name;
    case "IndexExpr":
      return false;
    case "Literal":
      return false;
    case "CallExpr":
      return false;
    case "MethodCallExpr":
      return false;
    case "UnaryExpr":
      return false;
    case "BinaryExpr":
      return false;
    case "AssignExpr":
      return false;
    case "AddressOfExpr":
      return false;
    case "DerefExpr":
      return false;
  }
}

function compareSortableValues(
  left: RuntimeValue,
  right: RuntimeValue,
  descending: boolean,
  line: number,
  fail: (message: string, line: number) => never,
): number {
  const leftValue = sortablePrimitive(left, line, fail);
  const rightValue = sortablePrimitive(right, line, fail);
  let result = 0;
  if (leftValue < rightValue) {
    result = -1;
  } else if (leftValue > rightValue) {
    result = 1;
  }
  return descending ? -result : result;
}

function sortablePrimitive(
  value: RuntimeValue,
  line: number,
  fail: (message: string, line: number) => never,
): bigint | number | boolean | string {
  if (
    value.kind === "int" ||
    value.kind === "double" ||
    value.kind === "bool" ||
    value.kind === "string"
  ) {
    return value.value;
  }
  fail("sort/reverse/fill supports only primitive vector values", line);
}
