import {
  describeBuiltinArity,
  getBuiltinFreeFunctionSpec,
  getBuiltinTemplateComparatorSpec,
  getSupportedTemplateTypeSpec,
} from "@/stdlib/registry";
import {
  mapKeyType,
  mapValueType,
  tupleElementTypes,
  vectorElementType,
} from "@/stdlib/template-types";
import {
  getSingleIntTemplateArg,
  getSingleTypeTemplateArg,
  isTemplateNamed,
  isTupleGetTemplateCall,
} from "@/stdlib/template-exprs";
import {
  compareValues,
  compareSortableValues,
  sameLocation,
  toNumericOperands,
} from "@/stdlib/builtins/compare";
import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";
import type { AssignTargetNode, ExprNode, TemplateCallExprNode, VectorTypeNode } from "@/types";
import { isVectorType, pairType, tupleType, vectorType } from "@/types";

export type { FailFn } from "@/stdlib/builtins/compare";

export interface EvalCtx {
  evaluateExpr(expr: ExprNode): RuntimeValue;
  fail(message: string, line: number): never;
  expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }>;
  expectBool(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "bool" }>;
  expectArray(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "array" }>;
  ensureInitialized(value: RuntimeValue, line: number, what: string): Exclude<RuntimeValue, { kind: "uninitialized" }>;
  ensureNotVoid(
    value: Exclude<RuntimeValue, { kind: "uninitialized" }>,
    line: number,
  ): Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>;
  castToElementType(value: RuntimeValue, elementType: import("@/types").TypeNode, line: number): RuntimeValue;
  runtimeValueToType(value: RuntimeValue, line: number): import("@/types").TypeNode;
  defaultValueForType(type: import("@/types").TypeNode, line: number): RuntimeValue;
  isAssignableTarget(expr: ExprNode): expr is AssignTargetNode;
  readAssignTarget(target: AssignTargetNode, line: number): RuntimeValue;
  writeAssignTarget(target: AssignTargetNode, value: RuntimeValue, line: number): void;
  resolveAssignTargetLocation(target: AssignTargetNode, line: number): RuntimeLocation;
  readLocation(location: RuntimeLocation, line: number): RuntimeValue;
  writeLocation(location: RuntimeLocation, value: RuntimeValue, line: number): void;
  arrays: Map<number, { type: import("@/types").TypeNode; values: RuntimeValue[] }>;
  findOrInsertMapEntry(
    mapValue: Extract<RuntimeValue, { kind: "map" }>,
    key: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
    line: number,
  ): number;
}

export function tryEvaluateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue | null {
  const builtin = getBuiltinFreeFunctionSpec(callee);
  if (builtin === null) {
    return null;
  }

  switch (builtin.kind) {
    case "value_function":
      switch (builtin.name) {
        case "abs": {
          if (args.length !== builtin.maxArgs) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} argument`, line);
          }
          const value: bigint = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
          return { kind: "int", value: value < 0n ? -value : value };
        }
        case "max":
        case "min": {
          if (args.length !== builtin.maxArgs) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`, line);
          }
          const left: bigint = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
          const right: bigint = ctx.expectInt(ctx.evaluateExpr(args[1] as ExprNode), line).value;
          return {
            kind: "int",
            value: builtin.name === "max"
              ? (left > right ? left : right)
              : (left < right ? left : right),
          };
        }
        case "swap": {
          if (args.length !== builtin.maxArgs) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`, line);
          }
          const left = args[0];
          const right = args[1];
          if (
            left === undefined ||
            right === undefined ||
            !ctx.isAssignableTarget(left) ||
            !ctx.isAssignableTarget(right)
          ) {
            ctx.fail("swap arguments must be lvalues", line);
          }
          const leftValue = ctx.readAssignTarget(left, line);
          const rightValue = ctx.readAssignTarget(right, line);
          ctx.writeAssignTarget(left, rightValue, line);
          ctx.writeAssignTarget(right, leftValue, line);
          return { kind: "void" };
        }
      }
      break;
    case "template_factory":
      switch (builtin.name) {
        case "make_pair": {
          if (args.length !== builtin.maxArgs) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`, line);
          }
          const firstExpr = args[0];
          const secondExpr = args[1];
          if (firstExpr === undefined || secondExpr === undefined) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`, line);
          }
          const firstValue = ctx.ensureNotVoid(
            ctx.ensureInitialized(ctx.evaluateExpr(firstExpr), line, "value"),
            line,
          );
          const secondValue = ctx.ensureNotVoid(
            ctx.ensureInitialized(ctx.evaluateExpr(secondExpr), line, "value"),
            line,
          );
          return {
            kind: "pair",
            type: {
              ...pairType(
                ctx.runtimeValueToType(firstValue, line),
                ctx.runtimeValueToType(secondValue, line),
              ),
            },
            first: firstValue,
            second: secondValue,
          };
        }
        case "make_tuple": {
          if (args.length < builtin.minArgs) {
            ctx.fail(`${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`, line);
          }
          const values = args.map((arg) =>
            ctx.ensureNotVoid(ctx.ensureInitialized(ctx.evaluateExpr(arg), line, "value"), line),
          );
          return {
            kind: "tuple",
            type: {
              ...tupleType(values.map((v) => ctx.runtimeValueToType(v, line))),
            },
            values,
          };
        }
      }
      break;
    case "range_algorithm":
      applyRangeBuiltin(builtin.name, args, line, ctx);
      return { kind: "void" };
    case "template_comparator":
      return null;
  }

  return null;
}

export function evaluateTemplateCall(
  expr: TemplateCallExprNode,
  ctx: EvalCtx,
  getTupleElementValue: (tupleExpr: ExprNode, index: number, line: number) => RuntimeValue,
  constructVectorValue: (
    type: import("@/types").VectorTypeNode,
    args: RuntimeValue[],
    line: number,
  ) => RuntimeValue,
): RuntimeValue {
  if (isTemplateNamed(expr.callee, "get")) {
    const index = getSingleIntTemplateArg(expr.callee);
    if (index === null) {
      ctx.fail("get requires a single non-negative integer template argument", expr.line);
    }
    const tupleExpr = expr.args[0];
    if (tupleExpr === undefined || expr.args.length !== 1) {
      ctx.fail("get requires exactly 1 argument", expr.line);
    }
    return getTupleElementValue(tupleExpr, index, expr.line);
  }

  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) {
    return ctx.fail(`'${expr.callee.template}' was not declared in this scope`, expr.line);
  }

  if (getSupportedTemplateTypeSpec(expr.callee.template) !== null && expr.callee.template === "vector") {
    const elementType = getSingleTypeTemplateArg(expr.callee);
    if (elementType === null) {
      ctx.fail("vector constructor requires exactly 1 type argument", expr.line);
    }
    const args = expr.args.map((arg) => ctx.evaluateExpr(arg));
    return constructVectorValue(vectorType(elementType), args, expr.line);
  }

  return ctx.fail(`unsupported template call '${expr.callee.template}'`, expr.line);
}

export function evaluateMethodCall(
  receiverExpr: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const receiver = ctx.evaluateExpr(receiverExpr);
  if (receiver.kind === "pair") {
    if (method !== "first" && method !== "second") {
      ctx.fail(`unknown pair member '${method}'`, line);
    }
    if (args.length !== 0) {
      ctx.fail(`${method} requires no arguments`, line);
    }
    return method === "first" ? receiver.first : receiver.second;
  }
  if (receiver.kind === "map") {
    if (method === "size") {
      if (args.length !== 0) {
        ctx.fail("size requires no arguments", line);
      }
      return { kind: "int", value: BigInt(receiver.entries.length) };
    }
    ctx.fail(`unknown map method '${method}'`, line);
  }
  const arrayValue = ctx.expectArray(receiver, line);
  const store = ctx.arrays.get(arrayValue.ref);
  if (store === undefined) {
    ctx.fail("invalid array reference", line);
  }
  if (!isVectorType(store.type)) {
    ctx.fail(`method '${method}' is not supported for fixed array`, line);
  }
  const vStore = store as { type: import("@/types").VectorTypeNode; values: RuntimeValue[] };

  if (method === "push_back") {
    if (args.length !== 1) {
      ctx.fail("push_back requires exactly 1 argument", line);
    }
    const value = ctx.castToElementType(
      ctx.evaluateExpr(args[0] as ExprNode),
      vectorElementType(vStore.type),
      line,
    );
    vStore.values.push(value);
    return { kind: "void" };
  }

  if (method === "pop_back") {
    if (args.length !== 0) {
      ctx.fail("pop_back requires no arguments", line);
    }
    if (vStore.values.length === 0) {
      ctx.fail("pop_back on empty vector", line);
    }
    vStore.values.pop();
    return { kind: "void" };
  }

  if (method === "size") {
    if (args.length !== 0) {
      ctx.fail("size requires no arguments", line);
    }
    return { kind: "int", value: BigInt(vStore.values.length) };
  }

  if (method === "back") {
    if (args.length !== 0) {
      ctx.fail("back requires no arguments", line);
    }
    const last = vStore.values[vStore.values.length - 1];
    if (last === undefined) {
      ctx.fail("back on empty vector", line);
    }
    return last;
  }

  if (method === "empty") {
    if (args.length !== 0) {
      ctx.fail("empty requires no arguments", line);
    }
    return { kind: "bool", value: vStore.values.length === 0 };
  }

  if (method === "clear") {
    if (args.length !== 0) {
      ctx.fail("clear requires no arguments", line);
    }
    vStore.values = [];
    return { kind: "void" };
  }

  if (method === "resize") {
    if (args.length !== 1) {
      ctx.fail("resize requires exactly 1 argument", line);
    }
    const newSize: bigint = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
    if (newSize < 0n) {
      ctx.fail("resize size must be non-negative", line);
    }
    const targetSize = Number(newSize);
    if (targetSize < vStore.values.length) {
      vStore.values = vStore.values.slice(0, targetSize);
    } else {
      while (vStore.values.length < targetSize) {
        vStore.values.push(ctx.defaultValueForType(vectorElementType(vStore.type), line));
      }
    }
    return { kind: "void" };
  }

  ctx.fail(`unknown vector method '${method}'`, line);
}

function applyRangeBuiltin(
  callee: "sort" | "reverse" | "fill",
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): void {
  const range = expectVectorRange(args, callee, line, ctx);
  const store = range.store;

  if (callee === "reverse") {
    store.values.reverse();
    return;
  }

  if (callee === "fill") {
    const fillArg = args[2];
    if (fillArg === undefined) {
      ctx.fail("fill requires exactly 3 arguments", line);
    }
    const fillValue = ctx.castToElementType(
      ctx.evaluateExpr(fillArg),
      vectorElementType(store.type),
      line,
    );
    store.values = store.values.map(() => fillValue);
    return;
  }

  const descending = isDescendingSortComparator(args[2], line, ctx);
  store.values.sort((left, right) =>
    compareSortableValues(left, right, descending, line, ctx.fail.bind(ctx)),
  );
}

function expectVectorRange(
  args: ExprNode[],
  callee: "sort" | "reverse" | "fill",
  line: number,
  ctx: EvalCtx,
): { store: { values: RuntimeValue[]; type: VectorTypeNode } } {
  const minArgs = callee === "fill" ? 3 : 2;
  const maxArgs = callee === "sort" ? 3 : callee === "fill" ? 3 : 2;
  if (args.length < minArgs || args.length > maxArgs) {
    ctx.fail(
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
    ctx.fail(`${callee} requires vector begin/end iterators`, line);
  }
  if (
    beginExpr.method !== "begin" ||
    endExpr.method !== "end" ||
    beginExpr.args.length !== 0 ||
    endExpr.args.length !== 0
  ) {
    ctx.fail(`${callee} requires vector begin/end iterators`, line);
  }
  if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
    ctx.fail(`${callee} requires iterators from the same vector`, line);
  }

  const receiver = ctx.evaluateExpr(beginExpr.receiver);
  const arrayValue = ctx.expectArray(receiver, line);
  const store = ctx.arrays.get(arrayValue.ref);
  if (store === undefined) {
    ctx.fail("invalid array reference", line);
  }
  if (!isVectorType(store.type)) {
    ctx.fail(`${callee} requires a vector range`, line);
  }

  return { store: store as { values: RuntimeValue[]; type: VectorTypeNode } };
}

function isDescendingSortComparator(
  expr: ExprNode | undefined,
  line: number,
  ctx: EvalCtx,
): boolean {
  if (expr === undefined) {
    return false;
  }
  if (
    expr.kind === "TemplateCallExpr" &&
    expr.args.length === 0 &&
    getBuiltinTemplateComparatorSpec(expr.callee.template) !== null
  ) {
    return true;
  }
  ctx.fail("unsupported sort comparator", line);
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

export {
  compareValues,
  compareSortableValues,
  sameLocation,
  toNumericOperands,
  isTupleGetTemplateCall,
};
