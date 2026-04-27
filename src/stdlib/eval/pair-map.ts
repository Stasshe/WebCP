import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerMethodHandler } from "@/stdlib/eval-registry";
import { getMapMethodSpec } from "@/stdlib/map-methods";
import type { ExprNode } from "@/types";

export function evalPairMember(
  receiver: Extract<RuntimeValue, { kind: "pair" }>,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  if (method !== "first" && method !== "second") {
    ctx.fail(`unknown pair member '${method}'`, line);
  }
  if (args.length !== 0) ctx.fail(`${method} requires no arguments`, line);
  return method === "first" ? receiver.first : receiver.second;
}

export function evalMapMethod(
  receiver: Extract<RuntimeValue, { kind: "map" }>,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const mapSpec = getMapMethodSpec(method);
  if (mapSpec === null) ctx.fail(`unknown map method '${method}'`, line);
  if (args.length < mapSpec.minArgs || args.length > mapSpec.maxArgs) {
    ctx.fail(`${method} requires no arguments`, line);
  }
  return { kind: "int", value: BigInt(receiver.entries.length) };
}

registerMethodHandler({
  matches: (v) => v.kind === "pair",
  handle: (receiver, method, args, line, ctx) =>
    evalPairMember(receiver as Extract<RuntimeValue, { kind: "pair" }>, method, args, line, ctx),
});

registerMethodHandler({
  matches: (v) => v.kind === "map",
  handle: (receiver, method, args, line, ctx) =>
    evalMapMethod(receiver as Extract<RuntimeValue, { kind: "map" }>, method, args, line, ctx),
});
