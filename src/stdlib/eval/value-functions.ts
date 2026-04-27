import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerFreeCall } from "@/stdlib/eval-registry";
import { describeBuiltinArity, getBuiltinValueFunctionSpec } from "@/stdlib/registry";
import type { ExprNode } from "@/types";

export function evalAbs(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinValueFunctionSpec("abs");
  if (spec === null) ctx.fail("abs: internal error", line);
  if (args.length !== spec.maxArgs) {
    ctx.fail(`abs requires ${describeBuiltinArity(spec)} argument`, line);
  }
  const value = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
  return { kind: "int", value: value < 0n ? -value : value };
}

export function evalMax(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinValueFunctionSpec("max");
  if (spec === null) ctx.fail("max: internal error", line);
  if (args.length !== spec.maxArgs) {
    ctx.fail(`max requires ${describeBuiltinArity(spec)} arguments`, line);
  }
  const left = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
  const right = ctx.expectInt(ctx.evaluateExpr(args[1] as ExprNode), line).value;
  return { kind: "int", value: left > right ? left : right };
}

export function evalMin(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinValueFunctionSpec("min");
  if (spec === null) ctx.fail("min: internal error", line);
  if (args.length !== spec.maxArgs) {
    ctx.fail(`min requires ${describeBuiltinArity(spec)} arguments`, line);
  }
  const left = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
  const right = ctx.expectInt(ctx.evaluateExpr(args[1] as ExprNode), line).value;
  return { kind: "int", value: left < right ? left : right };
}

export function evalSwap(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinValueFunctionSpec("swap");
  if (spec === null) ctx.fail("swap: internal error", line);
  if (args.length !== spec.maxArgs) {
    ctx.fail(`swap requires ${describeBuiltinArity(spec)} arguments`, line);
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

registerFreeCall("abs", evalAbs);
registerFreeCall("max", evalMax);
registerFreeCall("min", evalMin);
registerFreeCall("swap", evalSwap);
