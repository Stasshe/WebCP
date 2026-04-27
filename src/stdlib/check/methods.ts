import type { CheckCtx } from "@/stdlib/check-context";
import { getMapMethodSpec } from "@/stdlib/map-methods";
import { pairFirstType, pairSecondType } from "@/stdlib/template-types";
import type { ExprNode, TypeNode } from "@/types";
import { isMapType, isPairType } from "@/types";

export function checkPairMethod(
  receiverType: TypeNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  if (!isPairType(receiverType)) return null;
  if (method !== "first" && method !== "second") {
    ctx.pushError(line, col, `unknown pair member '${method}'`);
    for (const arg of args) ctx.validateExpr(arg);
    return null;
  }
  if (args.length !== 0) ctx.pushError(line, col, `${method} requires no arguments`);
  return method === "first" ? pairFirstType(receiverType) : pairSecondType(receiverType);
}

export function checkMapMethod(
  receiverType: TypeNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  if (!isMapType(receiverType)) return null;
  const mapSpec = getMapMethodSpec(method);
  if (mapSpec === null) {
    ctx.pushError(line, col, `unknown map method '${method}'`);
    for (const arg of args) ctx.validateExpr(arg);
    return null;
  }
  if (args.length < mapSpec.minArgs || args.length > mapSpec.maxArgs) {
    ctx.pushError(line, col, `${method} requires no arguments`);
  }
  return { kind: "PrimitiveType", name: "int" };
}
