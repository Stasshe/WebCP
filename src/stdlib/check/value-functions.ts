import type { CheckCtx } from "@/stdlib/check-context";
import { describeBuiltinArity, getBuiltinValueFunctionSpec } from "@/stdlib/registry";
import type { ExprNode, TypeNode } from "@/types";
import { typeToString } from "@/types";

export function checkAbs(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinValueFunctionSpec("abs");
  if (spec === null) {
    ctx.pushError(line, col, "abs: internal error");
    return { kind: "PrimitiveType", name: "int" };
  }
  if (args.length !== spec.maxArgs) {
    ctx.pushError(line, col, `abs requires ${describeBuiltinArity(spec)} argument`);
  }
  ctx.validateExpr(args[0] ?? null, "int");
  return { kind: "PrimitiveType", name: "int" };
}

export function checkMax(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinValueFunctionSpec("max");
  if (spec === null) {
    ctx.pushError(line, col, "max: internal error");
    return { kind: "PrimitiveType", name: "int" };
  }
  if (args.length !== spec.maxArgs) {
    ctx.pushError(line, col, `max requires ${describeBuiltinArity(spec)} arguments`);
  }
  ctx.validateExpr(args[0] ?? null, "int");
  ctx.validateExpr(args[1] ?? null, "int");
  return { kind: "PrimitiveType", name: "int" };
}

export function checkMin(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinValueFunctionSpec("min");
  if (spec === null) {
    ctx.pushError(line, col, "min: internal error");
    return { kind: "PrimitiveType", name: "int" };
  }
  if (args.length !== spec.maxArgs) {
    ctx.pushError(line, col, `min requires ${describeBuiltinArity(spec)} arguments`);
  }
  ctx.validateExpr(args[0] ?? null, "int");
  ctx.validateExpr(args[1] ?? null, "int");
  return { kind: "PrimitiveType", name: "int" };
}

export function checkSwap(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinValueFunctionSpec("swap");
  if (spec === null) {
    ctx.pushError(line, col, "swap: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length !== spec.maxArgs) {
    ctx.pushError(line, col, `swap requires ${describeBuiltinArity(spec)} arguments`);
  }
  const left = args[0];
  const right = args[1];
  if (left !== undefined) {
    const leftType = ctx.validateExpr(left);
    if (!ctx.isAssignableExpr(left)) {
      ctx.pushError(left.line, left.col, "swap arguments must be lvalues");
    }
    if (right !== undefined) {
      const rightType = ctx.validateExpr(right, leftType ?? undefined);
      if (!ctx.isAssignableExpr(right)) {
        ctx.pushError(right.line, right.col, "swap arguments must be lvalues");
      }
      if (leftType !== null && rightType !== null && !ctx.isAssignable(rightType, leftType)) {
        ctx.pushError(
          line,
          col,
          `cannot convert '${typeToString(rightType)}' to '${typeToString(leftType)}'`,
        );
      }
    }
  } else if (right !== undefined) {
    ctx.validateExpr(right);
  }
  return { kind: "PrimitiveType", name: "void" };
}
