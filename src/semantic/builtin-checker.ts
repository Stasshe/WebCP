import {
  describeBuiltinArity,
  getBuiltinFreeFunctionSpec,
  getBuiltinTemplateComparatorSpec,
  getSupportedTemplateTypeSpec,
} from "@/stdlib/registry";
import {
  pairFirstType,
  pairSecondType,
  tupleElementTypes,
  vectorElementType,
} from "@/stdlib/template-types";
import {
  getSingleIntTemplateArg,
  getSingleTypeTemplateArg,
  isTemplateNamed,
} from "@/stdlib/template-exprs";
import {
  isPointerType,
  isPairType,
  isReferenceType,
  isTupleType,
  isVectorType,
  pairType,
  tupleType,
  typeToString,
  vectorType,
} from "@/types";
import type {
  CompileError,
  ExprNode,
  TemplateCallExprNode,
  TypeNode,
  VectorTypeNode,
} from "@/types";
import { isAssignableExpr, isAssignable, sameType } from "./type-compat";
import { isIntType, isNumericType } from "./type-utils";

export type ValidationContext = {
  errors: CompileError[];
  functions: Map<string, import("@/types").FunctionDeclNode>;
  scopes: Map<string, TypeNode>[];
  loopDepth: number;
  currentReturnType: TypeNode | null;
};

export type ValidateExprFn = (
  expr: ExprNode | null,
  context: ValidationContext,
  expected?: TypeNode | "bool" | "int",
) => TypeNode | null;

export type InferExprTypeFn = (
  expr: ExprNode,
  context: ValidationContext,
) => TypeNode | null;

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
  if (builtin === null) {
    return undefined;
  }

  switch (builtin.kind) {
    case "value_function":
      switch (builtin.name) {
        case "abs":
          if (args.length !== builtin.maxArgs) {
            pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} argument`);
          }
          validateExpr(args[0] ?? null, context, "int");
          return { kind: "PrimitiveType", name: "int" };
        case "max":
        case "min":
          if (args.length !== builtin.maxArgs) {
            pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`);
          }
          validateExpr(args[0] ?? null, context, "int");
          validateExpr(args[1] ?? null, context, "int");
          return { kind: "PrimitiveType", name: "int" };
        case "swap": {
          if (args.length !== builtin.maxArgs) {
            pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`);
          }
          const left = args[0];
          const right = args[1];
          if (left !== undefined) {
            const leftType = validateExpr(left, context);
            if (!isAssignableExpr(left)) {
              pushError(context, left.line, left.col, "swap arguments must be lvalues");
            }
            if (right !== undefined) {
              const rightType = validateExpr(right, context, leftType ?? undefined);
              if (!isAssignableExpr(right)) {
                pushError(context, right.line, right.col, "swap arguments must be lvalues");
              }
              if (leftType !== null && rightType !== null && !isAssignable(rightType, leftType)) {
                pushError(
                  context, line, col,
                  `cannot convert '${typeToString(rightType)}' to '${typeToString(leftType)}'`,
                );
              }
            }
          } else if (right !== undefined) {
            validateExpr(right, context);
          }
          return { kind: "PrimitiveType", name: "void" };
        }
      }
      break;
    case "template_factory":
      switch (builtin.name) {
        case "make_pair": {
          if (args.length !== builtin.maxArgs) {
            pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`);
          }
          const firstType = validateExpr(args[0] ?? null, context);
          const secondType = validateExpr(args[1] ?? null, context);
          if (firstType === null || secondType === null) {
            return null;
          }
          return pairType(firstType, secondType);
        }
        case "make_tuple": {
          if (args.length < builtin.minArgs) {
            pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`);
            return null;
          }
          const elementTypes: TypeNode[] = [];
          for (const arg of args) {
            const elementType = validateExpr(arg, context);
            if (elementType === null) {
              return null;
            }
            elementTypes.push(elementType);
          }
          return tupleType(elementTypes);
        }
      }
      break;
    case "range_algorithm":
      return validateRangeBuiltin(builtin, args, line, col, context, validateExpr, inferExprType);
    case "template_comparator":
      pushError(context, line, col, `'${builtin.name}' was not declared in this scope`);
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
  if (isTemplateNamed(expr.callee, "get")) {
    const index = getSingleIntTemplateArg(expr.callee);
    if (index === null) {
      pushError(context, expr.line, expr.col, "get requires a single non-negative integer template argument");
      return null;
    }
    const tupleExpr = expr.args[0];
    const tupleTypeNode = tupleExpr === undefined ? null : inferExprType(tupleExpr, context);
    if (expr.args.length !== 1) {
      pushError(context, expr.line, expr.col, "get requires exactly 1 argument");
    }
    if (tupleTypeNode === null) {
      return null;
    }
    if (!isTupleType(tupleTypeNode)) {
      pushError(context, expr.line, expr.col, "type mismatch: expected tuple");
      return null;
    }
    const elementTypes = tupleElementTypes(tupleTypeNode);
    const elementType = elementTypes[index];
    if (elementType === undefined) {
      pushError(
        context, expr.line, expr.col,
        `tuple index ${index.toString()} out of range for tuple of size ${elementTypes.length}`,
      );
      return null;
    }
    return elementType;
  }

  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) {
    return null;
  }

  if (getSupportedTemplateTypeSpec(expr.callee.template) !== null && expr.callee.template === "vector") {
    const elementType = getSingleTypeTemplateArg(expr.callee);
    if (elementType === null) {
      pushError(context, expr.line, expr.col, "vector constructor requires exactly 1 type argument");
      return null;
    }
    const vType = vectorType(elementType);
    if (expr.args.length >= 1) {
      validateExpr(expr.args[0] ?? null, context, "int");
    }
    if (expr.args.length >= 2) {
      validateExpr(expr.args[1] ?? null, context, vectorElementType(vType));
    }
    if (expr.args.length > 2) {
      pushError(context, expr.line, expr.col, "too many arguments for vector constructor");
    }
    return vType;
  }

  pushError(context, expr.line, expr.col, `unsupported template call '${expr.callee.template}'`);
  for (const arg of expr.args) {
    validateExpr(arg, context);
  }
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
    for (const arg of args) {
      validateExpr(arg, context);
    }
    return null;
  }
  if (!isVectorType(receiverType)) {
    if (isPairType(receiverType)) {
      if (method !== "first" && method !== "second") {
        pushError(context, line, col, `unknown pair member '${method}'`);
        for (const arg of args) {
          validateExpr(arg, context);
        }
        return null;
      }
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return method === "first" ? pairFirstType(receiverType) : pairSecondType(receiverType);
    }
    pushError(context, line, col, "type mismatch: expected array/vector/pair");
    for (const arg of args) {
      validateExpr(arg, context);
    }
    return null;
  }

  switch (method) {
    case "begin":
    case "end":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return receiverType;
    case "push_back":
      if (args.length !== 1) {
        pushError(context, line, col, "push_back requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, vectorElementType(receiverType));
      return { kind: "PrimitiveType", name: "void" };
    case "pop_back":
    case "clear":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return { kind: "PrimitiveType", name: "void" };
    case "size":
      if (args.length !== 0) {
        pushError(context, line, col, "size requires no arguments");
      }
      return { kind: "PrimitiveType", name: "int" };
    case "back":
      if (args.length !== 0) {
        pushError(context, line, col, "back requires no arguments`");
      }
      return vectorElementType(receiverType);
    case "empty":
      if (args.length !== 0) {
        pushError(context, line, col, "empty requires no arguments");
      }
      return { kind: "PrimitiveType", name: "bool" };
    case "resize":
      if (args.length !== 1) {
        pushError(context, line, col, "resize requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, "int");
      return { kind: "PrimitiveType", name: "void" };
    default:
      pushError(context, line, col, `unknown vector method '${method}'`);
      for (const arg of args) {
        validateExpr(arg, context);
      }
      return null;
  }
}

function validateRangeBuiltin(
  builtin: Extract<ReturnType<typeof getBuiltinFreeFunctionSpec>, { kind: "range_algorithm" }>,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null {
  if (args.length < builtin.minArgs || args.length > builtin.maxArgs) {
    pushError(context, line, col, `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`);
  }

  const rangeType = validateVectorRangeArgs(
    args[0], args[1], builtin.name, context, line, col, validateExpr, inferExprType,
  );

  if (builtin.name === "fill") {
    validateExpr(
      args[2] ?? null,
      context,
      rangeType === null ? undefined : vectorElementType(rangeType),
    );
  } else if (builtin.name === "sort" && args[2] !== undefined) {
    const comparator = args[2];
    if (
      !(comparator.kind === "TemplateCallExpr" &&
        getBuiltinTemplateComparatorSpec(comparator.callee.template) !== null &&
        comparator.args.length === 0)
    ) {
      pushError(context, comparator.line, comparator.col, "unsupported sort comparator");
    }
  }

  return { kind: "PrimitiveType", name: "void" };
}

function validateVectorRangeArgs(
  beginExpr: ExprNode | undefined,
  endExpr: ExprNode | undefined,
  callee: string,
  context: ValidationContext,
  line: number,
  col: number,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): VectorTypeNode | null {
  if (
    beginExpr === undefined ||
    endExpr === undefined ||
    beginExpr.kind !== "MethodCallExpr" ||
    endExpr.kind !== "MethodCallExpr" ||
    beginExpr.method !== "begin" ||
    endExpr.method !== "end" ||
    beginExpr.args.length !== 0 ||
    endExpr.args.length !== 0
  ) {
    pushError(context, line, col, `${callee} requires vector begin/end iterators`);
    if (beginExpr !== undefined) {
      validateExpr(beginExpr, context);
    }
    if (endExpr !== undefined) {
      validateExpr(endExpr, context);
    }
    return null;
  }

  if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
    pushError(context, line, col, `${callee} requires iterators from the same vector`);
  }

  const receiverType = inferExprType(beginExpr.receiver, context);
  if (receiverType === null) {
    return null;
  }
  if (!isVectorType(receiverType)) {
    pushError(context, line, col, `${callee} requires a vector range`);
    return null;
  }
  return receiverType;
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
