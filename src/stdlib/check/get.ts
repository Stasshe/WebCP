import type { CheckCtx } from "@/stdlib/check-context";
import { registerTemplateCall } from "@/stdlib/check-registry";
import { getSingleIntTemplateArg } from "@/stdlib/template-exprs";
import { tupleElementTypes } from "@/stdlib/template-types";
import type { TemplateCallExprNode, TypeNode } from "@/types";
import { isTupleType } from "@/types";

export function checkTupleGet(expr: TemplateCallExprNode, ctx: CheckCtx): TypeNode | null {
  const index = getSingleIntTemplateArg(expr.callee);
  if (index === null) {
    ctx.pushError(
      expr.line,
      expr.col,
      "get requires a single non-negative integer template argument",
    );
    return null;
  }
  if (expr.args.length !== 1) {
    ctx.pushError(expr.line, expr.col, "get requires exactly 1 argument");
  }
  const tupleExpr = expr.args[0];
  const tupleTypeNode = tupleExpr === undefined ? null : ctx.inferExprType(tupleExpr);
  if (tupleTypeNode === null) return null;
  if (!isTupleType(tupleTypeNode)) {
    ctx.pushError(expr.line, expr.col, "type mismatch: expected tuple");
    return null;
  }
  const elementTypes = tupleElementTypes(tupleTypeNode);
  const elementType = elementTypes[index];
  if (elementType === undefined) {
    ctx.pushError(
      expr.line,
      expr.col,
      `tuple index ${index.toString()} out of range for tuple of size ${elementTypes.length}`,
    );
    return null;
  }
  return elementType;
}
