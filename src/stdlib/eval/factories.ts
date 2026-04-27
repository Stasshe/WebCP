import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerFreeCall } from "@/stdlib/eval-registry";
import { describeBuiltinArity, getBuiltinTemplateFactorySpec } from "@/stdlib/registry";
import type { ExprNode } from "@/types";
import { pairType, tupleType } from "@/types";

export function evalMakePair(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinTemplateFactorySpec("make_pair");
  if (spec === null) ctx.fail("make_pair: internal error", line);
  if (args.length !== spec.maxArgs) {
    ctx.fail(`make_pair requires ${describeBuiltinArity(spec)} arguments`, line);
  }
  const firstExpr = args[0];
  const secondExpr = args[1];
  if (firstExpr === undefined || secondExpr === undefined) {
    ctx.fail(`make_pair requires ${describeBuiltinArity(spec)} arguments`, line);
  }
  const first = ctx.ensureNotVoid(
    ctx.ensureInitialized(ctx.evaluateExpr(firstExpr), line, "value"),
    line,
  );
  const second = ctx.ensureNotVoid(
    ctx.ensureInitialized(ctx.evaluateExpr(secondExpr), line, "value"),
    line,
  );
  return {
    kind: "pair",
    type: {
      ...pairType(ctx.runtimeValueToType(first, line), ctx.runtimeValueToType(second, line)),
    },
    first,
    second,
  };
}

export function evalMakeTuple(args: ExprNode[], line: number, ctx: EvalCtx): RuntimeValue {
  const spec = getBuiltinTemplateFactorySpec("make_tuple");
  if (spec === null) ctx.fail("make_tuple: internal error", line);
  if (args.length < spec.minArgs) {
    ctx.fail(`make_tuple requires ${describeBuiltinArity(spec)} arguments`, line);
  }
  const values = args.map((arg) =>
    ctx.ensureNotVoid(ctx.ensureInitialized(ctx.evaluateExpr(arg), line, "value"), line),
  );
  return {
    kind: "tuple",
    type: { ...tupleType(values.map((v) => ctx.runtimeValueToType(v, line))) },
    values,
  };
}

registerFreeCall("make_pair", evalMakePair);
registerFreeCall("make_tuple", evalMakeTuple);
