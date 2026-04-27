import { checkMakePair, checkMakeTuple } from "@/stdlib/check/factories";
import { checkTupleGet } from "@/stdlib/check/get";
import { checkMapMethod, checkPairMethod } from "@/stdlib/check/methods";
import { checkFill, checkReverse, checkSort } from "@/stdlib/check/range-algorithms";
import { checkAbs, checkMax, checkMin, checkSwap } from "@/stdlib/check/value-functions";
import { checkVectorConstructor, checkVectorMethod } from "@/stdlib/check/vector";
import type { CheckCtx } from "@/stdlib/check-context";
import { getBuiltinFreeFunctionSpec, getBuiltinTemplateComparatorSpec } from "@/stdlib/registry";
import { isTemplateNamed } from "@/stdlib/template-exprs";
import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  TemplateCallExprNode,
  TemplateFunctionDeclNode,
  TypeNode,
} from "@/types";
import { isMapType, isPairType, isVectorType } from "@/types";
import { inferTypeArgs, instantiateFunction, instantiationKey } from "./template-instantiator";
import { isAssignable, isAssignableExpr } from "./type-compat";

export type ValidationContext = {
  errors: CompileError[];
  functions: Map<string, import("@/types").FunctionDeclNode>;
  templateFunctions: Map<string, import("@/types").TemplateFunctionDeclNode>;
  scopes: Map<string, TypeNode>[];
  loopDepth: number;
  currentReturnType: TypeNode | null;
  instantiatingTemplates: Set<string>;
};

export type ValidateExprFn = (
  expr: ExprNode | null,
  context: ValidationContext,
  expected?: TypeNode | "bool" | "int",
) => TypeNode | null;

export type InferExprTypeFn = (expr: ExprNode, context: ValidationContext) => TypeNode | null;

function makeCheckCtx(
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): CheckCtx {
  return {
    pushError: (line, col, message) => context.errors.push({ line, col, message }),
    validateExpr: (expr, expected) => validateExpr(expr, context, expected),
    inferExprType: (expr) => inferExprType(expr, context),
    isAssignableExpr,
    isAssignable,
  };
}

export function validateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null | undefined {
  const builtin = getBuiltinFreeFunctionSpec(callee);
  if (builtin === null) return undefined;

  const ctx = makeCheckCtx(context, validateExpr, inferExprType);

  if (builtin.kind === "value_function") {
    switch (builtin.name) {
      case "abs":
        return checkAbs(args, line, col, ctx);
      case "max":
        return checkMax(args, line, col, ctx);
      case "min":
        return checkMin(args, line, col, ctx);
      case "swap":
        return checkSwap(args, line, col, ctx);
    }
  }
  if (builtin.kind === "template_factory") {
    switch (builtin.name) {
      case "make_pair":
        return checkMakePair(args, line, col, ctx);
      case "make_tuple":
        return checkMakeTuple(args, line, col, ctx);
    }
  }
  if (builtin.kind === "range_algorithm") {
    switch (builtin.name) {
      case "sort":
        return checkSort(args, line, col, ctx);
      case "reverse":
        return checkReverse(args, line, col, ctx);
      case "fill":
        return checkFill(args, line, col, ctx);
    }
  }
  if (builtin.kind === "template_comparator") {
    context.errors.push({ line, col, message: `'${builtin.name}' was not declared in this scope` });
    return null;
  }
  return undefined;
}

export function validateTemplateCall(
  expr: TemplateCallExprNode,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null {
  const ctx = makeCheckCtx(context, validateExpr, inferExprType);

  if (isTemplateNamed(expr.callee, "get")) return checkTupleGet(expr, ctx);

  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) return null;

  if (isTemplateNamed(expr.callee, "vector")) return checkVectorConstructor(expr, ctx);

  context.errors.push({
    line: expr.line,
    col: expr.col,
    message: `unsupported template call '${expr.callee.template}'`,
  });
  for (const arg of expr.args) validateExpr(arg, context);
  return null;
}

export function validateMethodCall(
  receiver: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null {
  const receiverType = inferExprType(receiver, context);
  if (receiverType === null) {
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const ctx = makeCheckCtx(context, validateExpr, inferExprType);

  if (isPairType(receiverType)) return checkPairMethod(receiverType, method, args, line, col, ctx);
  if (isMapType(receiverType)) return checkMapMethod(receiverType, method, args, line, col, ctx);

  if (!isVectorType(receiverType)) {
    context.errors.push({ line, col, message: "type mismatch: expected array/vector/pair/map" });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  return checkVectorMethod(receiverType, method, args, line, col, ctx);
}

export function validateTemplateFunctionCall(
  templateFn: TemplateFunctionDeclNode,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
  validateArgumentAgainstParam: (
    arg: ExprNode,
    paramType: TypeNode | undefined,
    context: ValidationContext,
  ) => void,
  validateInstantiatedFn: (fn: FunctionDeclNode, context: ValidationContext) => void,
): TypeNode | null {
  if (args.length !== templateFn.params.length) {
    context.errors.push({
      line,
      col,
      message: `'${templateFn.name}' requires ${templateFn.params.length.toString()} argument${templateFn.params.length === 1 ? "" : "s"}`,
    });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const argTypes = args.map((arg) => inferExprType(arg, context));
  const map = inferTypeArgs(templateFn.typeParams, templateFn.params, argTypes);
  if (map === null) {
    context.errors.push({
      line,
      col,
      message: `cannot deduce template arguments for '${templateFn.name}'`,
    });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const key = instantiationKey(templateFn.name, map, templateFn.typeParams);
  if (context.instantiatingTemplates.has(key)) return null;

  context.instantiatingTemplates.add(key);
  const instantiated = instantiateFunction(templateFn, map);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const param = instantiated.params[i];
    if (arg !== undefined && param !== undefined) {
      validateArgumentAgainstParam(arg, param.type, context);
    }
  }
  validateInstantiatedFn(instantiated, context);
  context.instantiatingTemplates.delete(key);

  return instantiated.returnType;
}
