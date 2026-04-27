import type { CheckCtx } from "@/stdlib/check-context";
import { getSingleTypeTemplateArg } from "@/stdlib/template-exprs";
import { vectorElementType } from "@/stdlib/template-types";
import { describeVectorMethodArgs, getVectorMethodSpec } from "@/stdlib/vector-methods";
import type { ExprNode, TemplateCallExprNode, TypeNode } from "@/types";
import { isVectorType, vectorType } from "@/types";

export function checkVectorConstructor(expr: TemplateCallExprNode, ctx: CheckCtx): TypeNode | null {
  const elementType = getSingleTypeTemplateArg(expr.callee);
  if (elementType === null) {
    ctx.pushError(expr.line, expr.col, "vector constructor requires exactly 1 type argument");
    return null;
  }
  const vType = vectorType(elementType);
  if (expr.args.length >= 1) {
    ctx.validateExpr(expr.args[0] ?? null, "int");
  }
  if (expr.args.length >= 2) {
    ctx.validateExpr(expr.args[1] ?? null, vectorElementType(vType));
  }
  if (expr.args.length > 2) {
    ctx.pushError(expr.line, expr.col, "too many arguments for vector constructor");
  }
  return vType;
}

export function checkVectorMethod(
  receiverType: TypeNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  if (!isVectorType(receiverType)) return null;

  if (method === "begin" || method === "end") {
    if (args.length !== 0) ctx.pushError(line, col, `${method} requires no arguments`);
    return receiverType;
  }

  const vecSpec = getVectorMethodSpec(method);
  if (vecSpec === null) {
    ctx.pushError(line, col, `unknown vector method '${method}'`);
    for (const arg of args) ctx.validateExpr(arg);
    return null;
  }

  if (args.length < vecSpec.minArgs || args.length > vecSpec.maxArgs) {
    ctx.pushError(line, col, `${method} requires ${describeVectorMethodArgs(vecSpec)}`);
  }
  if (method === "push_back") {
    ctx.validateExpr(args[0] ?? null, vectorElementType(receiverType));
  } else if (method === "resize") {
    ctx.validateExpr(args[0] ?? null, "int");
  }

  switch (vecSpec.returns) {
    case "void":
      return { kind: "PrimitiveType", name: "void" };
    case "int":
      return { kind: "PrimitiveType", name: "int" };
    case "bool":
      return { kind: "PrimitiveType", name: "bool" };
    case "element":
      return vectorElementType(receiverType);
  }
}
