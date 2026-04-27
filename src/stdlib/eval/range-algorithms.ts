import type { RuntimeValue } from "@/runtime/value";
import { compareSortableValues } from "@/stdlib/builtins/compare";
import type { EvalCtx } from "@/stdlib/eval-context";
import { getBuiltinTemplateComparatorSpec } from "@/stdlib/registry";
import { vectorElementType } from "@/stdlib/template-types";
import type { ExprNode, VectorTypeNode } from "@/types";
import { isVectorType } from "@/types";

export function evalSort(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "sort", line, ctx);
  const descending = isDescendingSortComparator(args[2], line, ctx);
  store.values.sort((left, right) =>
    compareSortableValues(left, right, descending, line, ctx.fail.bind(ctx)),
  );
}

export function evalReverse(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "reverse", line, ctx);
  store.values.reverse();
}

export function evalFill(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "fill", line, ctx);
  const fillArg = args[2];
  if (fillArg === undefined) ctx.fail("fill requires exactly 3 arguments", line);
  const fillValue = ctx.castToElementType(
    ctx.evaluateExpr(fillArg),
    vectorElementType(store.type),
    line,
  );
  store.values = store.values.map(() => fillValue);
}

function expectVectorRange(
  args: ExprNode[],
  callee: "sort" | "reverse" | "fill",
  line: number,
  ctx: EvalCtx,
): { values: RuntimeValue[]; type: VectorTypeNode } {
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
  if (store === undefined) ctx.fail("invalid array reference", line);
  if (!isVectorType(store.type)) ctx.fail(`${callee} requires a vector range`, line);
  return store as { values: RuntimeValue[]; type: VectorTypeNode };
}

function isDescendingSortComparator(
  expr: ExprNode | undefined,
  line: number,
  ctx: EvalCtx,
): boolean {
  if (expr === undefined) return false;
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
