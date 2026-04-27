import type { ExprNode, TemplateCallExprNode, TypeNode } from "@/types";
import type { CheckCtx } from "./check-context";

type FreeCallCheckHandler = (
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
) => TypeNode | null;

type TemplateCallCheckHandler = (expr: TemplateCallExprNode, ctx: CheckCtx) => TypeNode | null;

type MethodCheckRegistration = {
  matches: (receiverType: TypeNode) => boolean;
  handle: (
    receiverType: TypeNode,
    method: string,
    args: ExprNode[],
    line: number,
    col: number,
    ctx: CheckCtx,
  ) => TypeNode | null;
};

const freeCallHandlers = new Map<string, FreeCallCheckHandler>();
const templateCallHandlers = new Map<string, TemplateCallCheckHandler>();
const methodRegistrations: MethodCheckRegistration[] = [];

export function registerFreeCall(name: string, handler: FreeCallCheckHandler): void {
  freeCallHandlers.set(name, handler);
}

export function registerTemplateCall(name: string, handler: TemplateCallCheckHandler): void {
  templateCallHandlers.set(name, handler);
}

export function registerMethodHandler(registration: MethodCheckRegistration): void {
  methodRegistrations.push(registration);
}

export function dispatchFreeCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null | "not_registered" {
  const handler = freeCallHandlers.get(callee);
  if (handler === undefined) return "not_registered";
  return handler(args, line, col, ctx);
}

export function dispatchTemplateCall(
  expr: TemplateCallExprNode,
  ctx: CheckCtx,
): TypeNode | null | "not_registered" {
  const handler = templateCallHandlers.get(expr.callee.template);
  if (handler === undefined) return "not_registered";
  return handler(expr, ctx);
}

export function dispatchMethodCall(
  receiverType: TypeNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null | "not_matched" {
  for (const reg of methodRegistrations) {
    if (reg.matches(receiverType)) return reg.handle(receiverType, method, args, line, col, ctx);
  }
  return "not_matched";
}
