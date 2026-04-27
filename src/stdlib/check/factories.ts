import type { CheckCtx } from "@/stdlib/check-context";
import { registerFreeCall } from "@/stdlib/check-registry";
import { describeBuiltinArity, getBuiltinTemplateFactorySpec } from "@/stdlib/registry";
import type { ExprNode, TypeNode } from "@/types";
import { pairType, tupleType } from "@/types";

export function checkMakePair(
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  const spec = getBuiltinTemplateFactorySpec("make_pair");
  if (spec === null) {
    ctx.pushError(line, col, "make_pair: internal error");
    return null;
  }
  if (args.length !== spec.maxArgs) {
    ctx.pushError(line, col, `make_pair requires ${describeBuiltinArity(spec)} arguments`);
  }
  const firstType = ctx.validateExpr(args[0] ?? null);
  const secondType = ctx.validateExpr(args[1] ?? null);
  if (firstType === null || secondType === null) return null;
  return pairType(firstType, secondType);
}

export function checkMakeTuple(
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  const spec = getBuiltinTemplateFactorySpec("make_tuple");
  if (spec === null) {
    ctx.pushError(line, col, "make_tuple: internal error");
    return null;
  }
  if (args.length < spec.minArgs) {
    ctx.pushError(line, col, `make_tuple requires ${describeBuiltinArity(spec)} arguments`);
    return null;
  }
  const elementTypes: TypeNode[] = [];
  for (const arg of args) {
    const elementType = ctx.validateExpr(arg);
    if (elementType === null) return null;
    elementTypes.push(elementType);
  }
  return tupleType(elementTypes);
}

registerFreeCall("make_pair", checkMakePair);
registerFreeCall("make_tuple", checkMakeTuple);
