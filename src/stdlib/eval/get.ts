import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { getSingleIntTemplateArg, isTemplateNamed } from "@/stdlib/template-exprs";
import { tupleElementTypes } from "@/stdlib/template-types";
import type { ExprNode, TemplateCallExprNode } from "@/types";

export function evalTupleGet(expr: TemplateCallExprNode, ctx: EvalCtx): RuntimeValue {
  const index = getSingleIntTemplateArg(expr.callee);
  if (index === null)
    ctx.fail("get requires a single non-negative integer template argument", expr.line);
  const tupleExpr = expr.args[0];
  if (tupleExpr === undefined || expr.args.length !== 1) {
    ctx.fail("get requires exactly 1 argument", expr.line);
  }
  return getTupleElementValue(tupleExpr, index, expr.line, ctx);
}

export function isTupleGetCall(expr: ExprNode): expr is TemplateCallExprNode {
  return expr.kind === "TemplateCallExpr" && isTemplateNamed(expr.callee, "get");
}

function getTupleElementValue(
  tupleExpr: ExprNode,
  index: number,
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const tupleValue = ctx.ensureInitialized(ctx.evaluateExpr(tupleExpr), line, "tuple");
  if (tupleValue.kind !== "tuple") ctx.fail("type mismatch: expected tuple", line);
  const elementTypes = tupleElementTypes(tupleValue.type);
  if (index >= elementTypes.length || index < 0) {
    ctx.fail(
      `tuple index ${index.toString()} out of range for tuple of size ${tupleValue.values.length}`,
      line,
    );
  }
  const elementValue = tupleValue.values[index];
  if (elementValue === undefined) {
    ctx.fail(
      `tuple index ${index.toString()} out of range for tuple of size ${tupleValue.values.length}`,
      line,
    );
  }
  return ctx.ensureNotVoid(ctx.ensureInitialized(elementValue, line, "tuple element"), line);
}
