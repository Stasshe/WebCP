import type { RuntimeValue } from "@/runtime/value";
import type { ExprNode, TemplateCallExprNode } from "@/types";
import type { EvalCtx } from "./eval-context";

type FreeCallEvalHandler = (args: ExprNode[], line: number, ctx: EvalCtx) => RuntimeValue;
type TemplateCallEvalHandler = (expr: TemplateCallExprNode, ctx: EvalCtx) => RuntimeValue;

type MethodEvalRegistration = {
  matches: (receiver: RuntimeValue) => boolean;
  handle: (
    receiver: RuntimeValue,
    method: string,
    args: ExprNode[],
    line: number,
    ctx: EvalCtx,
  ) => RuntimeValue;
};

const freeCallHandlers = new Map<string, FreeCallEvalHandler>();
const templateCallHandlers = new Map<string, TemplateCallEvalHandler>();
const methodRegistrations: MethodEvalRegistration[] = [];

export function registerFreeCall(name: string, handler: FreeCallEvalHandler): void {
  freeCallHandlers.set(name, handler);
}

export function registerTemplateCall(name: string, handler: TemplateCallEvalHandler): void {
  templateCallHandlers.set(name, handler);
}

export function registerMethodHandler(registration: MethodEvalRegistration): void {
  methodRegistrations.push(registration);
}

export function dispatchFreeCall(
  callee: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue | null {
  const handler = freeCallHandlers.get(callee);
  return handler !== undefined ? handler(args, line, ctx) : null;
}

export function dispatchTemplateCall(
  expr: TemplateCallExprNode,
  ctx: EvalCtx,
): RuntimeValue | null {
  const handler = templateCallHandlers.get(expr.callee.template);
  return handler !== undefined ? handler(expr, ctx) : null;
}

export function dispatchMethodCall(
  receiver: RuntimeValue,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue | null {
  for (const reg of methodRegistrations) {
    if (reg.matches(receiver)) return reg.handle(receiver, method, args, line, ctx);
  }
  return null;
}
