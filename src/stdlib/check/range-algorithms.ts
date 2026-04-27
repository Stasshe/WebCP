import type { CheckCtx } from "@/stdlib/check-context";
import { registerFreeCall } from "@/stdlib/check-registry";
import {
  describeBuiltinArity,
  getBuiltinRangeAlgorithmSpec,
  getBuiltinTemplateComparatorSpec,
} from "@/stdlib/registry";
import { vectorElementType } from "@/stdlib/template-types";
import type { ExprNode, TypeNode, VectorTypeNode } from "@/types";
import { isVectorType } from "@/types";

export function checkSort(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("sort");
  if (spec === null) {
    ctx.pushError(line, col, "sort: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `sort requires ${describeBuiltinArity(spec)} arguments`);
  }
  validateVectorRangeArgs(args[0], args[1], "sort", line, col, ctx);
  if (args[2] !== undefined) {
    const comparator = args[2];
    if (
      !(
        comparator.kind === "TemplateCallExpr" &&
        getBuiltinTemplateComparatorSpec(comparator.callee.template) !== null &&
        comparator.args.length === 0
      )
    ) {
      ctx.pushError(comparator.line, comparator.col, "unsupported sort comparator");
    }
  }
  return { kind: "PrimitiveType", name: "void" };
}

export function checkReverse(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("reverse");
  if (spec === null) {
    ctx.pushError(line, col, "reverse: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `reverse requires ${describeBuiltinArity(spec)} arguments`);
  }
  validateVectorRangeArgs(args[0], args[1], "reverse", line, col, ctx);
  return { kind: "PrimitiveType", name: "void" };
}

export function checkFill(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("fill");
  if (spec === null) {
    ctx.pushError(line, col, "fill: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `fill requires ${describeBuiltinArity(spec)} arguments`);
  }
  const rangeType = validateVectorRangeArgs(args[0], args[1], "fill", line, col, ctx);
  ctx.validateExpr(args[2] ?? null, rangeType === null ? undefined : vectorElementType(rangeType));
  return { kind: "PrimitiveType", name: "void" };
}

function validateVectorRangeArgs(
  beginExpr: ExprNode | undefined,
  endExpr: ExprNode | undefined,
  callee: string,
  line: number,
  col: number,
  ctx: CheckCtx,
): VectorTypeNode | null {
  if (
    beginExpr === undefined ||
    endExpr === undefined ||
    beginExpr.kind !== "MethodCallExpr" ||
    endExpr.kind !== "MethodCallExpr" ||
    beginExpr.method !== "begin" ||
    endExpr.method !== "end" ||
    beginExpr.args.length !== 0 ||
    endExpr.args.length !== 0
  ) {
    ctx.pushError(line, col, `${callee} requires vector begin/end iterators`);
    if (beginExpr !== undefined) ctx.validateExpr(beginExpr);
    if (endExpr !== undefined) ctx.validateExpr(endExpr);
    return null;
  }

  if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
    ctx.pushError(line, col, `${callee} requires iterators from the same vector`);
  }

  const receiverType = ctx.inferExprType(beginExpr.receiver);
  if (receiverType === null) return null;
  if (!isVectorType(receiverType)) {
    ctx.pushError(line, col, `${callee} requires a vector range`);
    return null;
  }
  return receiverType;
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

registerFreeCall("sort", checkSort);
registerFreeCall("reverse", checkReverse);
registerFreeCall("fill", checkFill);
