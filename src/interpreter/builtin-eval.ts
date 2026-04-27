import type { RuntimeValue } from "@/runtime/value";
import {
  compareSortableValues,
  compareValues,
  sameLocation,
  toNumericOperands,
} from "@/stdlib/builtins/compare";
import { evalMakePair, evalMakeTuple } from "@/stdlib/eval/factories";
import { evalTupleGet } from "@/stdlib/eval/get";
import { evalMapMethod, evalPairMember } from "@/stdlib/eval/pair-map";
import { evalFill, evalReverse, evalSort } from "@/stdlib/eval/range-algorithms";
import { evalAbs, evalMax, evalMin, evalSwap } from "@/stdlib/eval/value-functions";
import { evalVectorConstructor, evalVectorMethod } from "@/stdlib/eval/vector";
import type { EvalCtx } from "@/stdlib/eval-context";
import { getBuiltinFreeFunctionSpec, getBuiltinTemplateComparatorSpec } from "@/stdlib/registry";
import {
  getSingleTypeTemplateArg,
  isTemplateNamed,
  isTupleGetTemplateCall,
} from "@/stdlib/template-exprs";
import type { ExprNode, TemplateCallExprNode } from "@/types";
import { isVectorType, vectorType } from "@/types";

export type { FailFn } from "@/stdlib/builtins/compare";
export type { EvalCtx } from "@/stdlib/eval-context";

export function tryEvaluateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue | null {
  const builtin = getBuiltinFreeFunctionSpec(callee);
  if (builtin === null) return null;

  if (builtin.kind === "value_function") {
    switch (builtin.name) {
      case "abs":
        return evalAbs(args, line, ctx);
      case "max":
        return evalMax(args, line, ctx);
      case "min":
        return evalMin(args, line, ctx);
      case "swap":
        return evalSwap(args, line, ctx);
    }
  }
  if (builtin.kind === "template_factory") {
    switch (
      builtin.name //ここびみょくね？
    ) {
      case "make_pair":
        return evalMakePair(args, line, ctx);
      case "make_tuple":
        return evalMakeTuple(args, line, ctx);
    }
  }
  if (builtin.kind === "range_algorithm") {
    switch (builtin.name) {
      case "sort":
        evalSort(args, line, ctx);
        break;
      case "reverse":
        evalReverse(args, line, ctx);
        break;
      case "fill":
        evalFill(args, line, ctx);
        break;
    }
    return { kind: "void" };
  }
  return null;
}

export function evaluateTemplateCall(expr: TemplateCallExprNode, ctx: EvalCtx): RuntimeValue {
  if (isTemplateNamed(expr.callee, "get")) {
    return evalTupleGet(expr, ctx);
  }

  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) {
    return ctx.fail(`'${expr.callee.template}' was not declared in this scope`, expr.line);
  }

  if (isTemplateNamed(expr.callee, "vector")) {
    const elementType = getSingleTypeTemplateArg(expr.callee);
    if (elementType === null) {
      ctx.fail("vector constructor requires exactly 1 type argument", expr.line);
    }
    const args = expr.args.map((arg) => ctx.evaluateExpr(arg));
    return evalVectorConstructor(vectorType(elementType), args, expr.line, ctx);
  }

  return ctx.fail(`unsupported template call '${expr.callee.template}'`, expr.line);
}

export function evaluateMethodCall(
  receiverExpr: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const receiver = ctx.evaluateExpr(receiverExpr);

  if (receiver.kind === "pair") return evalPairMember(receiver, method, args, line, ctx);
  if (receiver.kind === "map") return evalMapMethod(receiver, method, args, line, ctx);

  const arrayValue = ctx.expectArray(receiver, line);
  const store = ctx.arrays.get(arrayValue.ref);
  if (store === undefined) ctx.fail("invalid array reference", line);
  if (!isVectorType(store.type)) {
    ctx.fail(`method '${method}' is not supported for fixed array`, line);
  }

  return evalVectorMethod(
    method,
    args,
    store as { type: import("@/types").VectorTypeNode; values: RuntimeValue[] },
    line,
    ctx,
  );
}

export {
  compareSortableValues,
  compareValues,
  isTupleGetTemplateCall,
  sameLocation,
  toNumericOperands,
};
