import {
  isArrayType,
  isMapType,
  isPairType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTupleType,
  isVectorType,
  pairType,
  tupleType,
  typeToString,
} from "@/types";
import type { BinaryExprNode, ExprNode, TypeNode } from "@/types";
import {
  mapKeyType,
  mapValueType,
  pairFirstType,
  pairSecondType,
  tupleElementTypes,
  vectorElementType,
} from "@/stdlib/template-types";
import { isTupleGetTemplateCall } from "@/stdlib/template-exprs";
import {
  isDoubleType,
  isIntType,
  isNullPointerType,
  isNumericType,
  isStringType,
} from "./type-utils";

export type PushErrorFn = (line: number, col: number, message: string) => void;

export function sameType(left: TypeNode, right: TypeNode): boolean {
  if (isPrimitiveType(left) || isPrimitiveType(right)) {
    return isPrimitiveType(left) && isPrimitiveType(right) && left.name === right.name;
  }
  if (isArrayType(left) || isArrayType(right)) {
    return (
      isArrayType(left) && isArrayType(right) && sameType(left.elementType, right.elementType)
    );
  }
  if (isVectorType(left) || isVectorType(right)) {
    return (
      isVectorType(left) &&
      isVectorType(right) &&
      sameType(vectorElementType(left), vectorElementType(right))
    );
  }
  if (isMapType(left) || isMapType(right)) {
    return (
      isMapType(left) &&
      isMapType(right) &&
      sameType(mapKeyType(left), mapKeyType(right)) &&
      sameType(mapValueType(left), mapValueType(right))
    );
  }
  if (isPairType(left) || isPairType(right)) {
    return (
      isPairType(left) &&
      isPairType(right) &&
      sameType(pairFirstType(left), pairFirstType(right)) &&
      sameType(pairSecondType(left), pairSecondType(right))
    );
  }
  if (isTupleType(left) || isTupleType(right)) {
    const leftEls = isTupleType(left) ? tupleElementTypes(left) : [];
    const rightEls = isTupleType(right) ? tupleElementTypes(right) : [];
    return (
      isTupleType(left) &&
      isTupleType(right) &&
      leftEls.length === rightEls.length &&
      leftEls.every((t, i) => {
        const r = rightEls[i];
        return r !== undefined && sameType(t, r);
      })
    );
  }
  if (isPointerType(left) || isPointerType(right)) {
    return (
      isPointerType(left) &&
      isPointerType(right) &&
      sameType(left.pointeeType, right.pointeeType)
    );
  }
  if (isReferenceType(left) || isReferenceType(right)) {
    return (
      isReferenceType(left) &&
      isReferenceType(right) &&
      sameType(left.referredType, right.referredType)
    );
  }
  return false;
}

export function isAssignable(source: TypeNode, target: TypeNode): boolean {
  if (sameType(source, target)) {
    return true;
  }
  if (isPairType(source) && isPairType(target)) {
    return (
      isAssignable(pairFirstType(source), pairFirstType(target)) &&
      isAssignable(pairSecondType(source), pairSecondType(target))
    );
  }
  if (isMapType(source) && isMapType(target)) {
    return (
      isAssignable(mapKeyType(source), mapKeyType(target)) &&
      isAssignable(mapValueType(source), mapValueType(target))
    );
  }
  if (isTupleType(source) && isTupleType(target)) {
    const srcEls = tupleElementTypes(source);
    const tgtEls = tupleElementTypes(target);
    return (
      srcEls.length === tgtEls.length &&
      srcEls.every((t, i) => {
        const tgt = tgtEls[i];
        return tgt !== undefined && isAssignable(t, tgt);
      })
    );
  }
  return (
    isPrimitiveType(source) &&
    isPrimitiveType(target) &&
    ((source.name === "char" && target.name === "string") ||
      (source.name === "string" && target.name === "char") ||
      ((source.name === "int" || source.name === "long long" || source.name === "char") &&
        (target.name === "int" || target.name === "long long" || target.name === "char")) ||
      ((source.name === "int" || source.name === "long long" || source.name === "char") &&
        target.name === "double") ||
      (source.name === "double" &&
        (target.name === "int" || target.name === "long long" || target.name === "char")))
  );
}

export function isAssignableExpr(expr: ExprNode): boolean {
  return (
    expr.kind === "Identifier" ||
    expr.kind === "IndexExpr" ||
    expr.kind === "DerefExpr" ||
    isTupleGetTemplateCall(expr)
  );
}

export function inferBinaryType(
  expr: BinaryExprNode,
  left: TypeNode | null,
  right: TypeNode | null,
  pushError: PushErrorFn,
): TypeNode | null {
  if (expr.operator === "+") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isIntType(left) && isPointerType(right)) {
      return right;
    }
  }

  if (expr.operator === "-") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isPointerType(left) && isPointerType(right)) {
      if (!sameType(left, right)) {
        pushError(expr.line, expr.col, "type mismatch in pointer subtraction");
      }
      return { kind: "PrimitiveType", name: "int" };
    }
  }

  if (expr.operator === "&&" || expr.operator === "||") {
    if (left !== null && !(isPrimitiveType(left) && left.name === "bool")) {
      pushError(expr.left.line, expr.left.col, "type mismatch: expected bool");
    }
    if (right !== null && !(isPrimitiveType(right) && right.name === "bool")) {
      pushError(expr.right.line, expr.right.col, "type mismatch: expected bool");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "==" ||
    expr.operator === "!=" ||
    expr.operator === "<" ||
    expr.operator === "<=" ||
    expr.operator === ">" ||
    expr.operator === ">="
  ) {
    if ((left !== null && isPointerType(left)) || (right !== null && isPointerType(right))) {
      if (expr.operator !== "==" && expr.operator !== "!=") {
        pushError(expr.line, expr.col, "pointer comparison only supports == and !=");
      }
      if (
        left !== null &&
        right !== null &&
        !sameType(left, right) &&
        !(isPointerType(left) && isNullPointerType(right)) &&
        !(isPointerType(right) && isNullPointerType(left))
      ) {
        pushError(expr.line, expr.col, "type mismatch in comparison");
      }
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      (left !== null && (isPairType(left) || isTupleType(left))) ||
      (right !== null && (isPairType(right) || isTupleType(right)))
    ) {
      pushError(expr.line, expr.col, "tuple/pair comparison is not supported");
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      left !== null &&
      right !== null &&
      !sameType(left, right) &&
      !(isNumericType(left) && isNumericType(right))
    ) {
      pushError(expr.line, expr.col, "type mismatch in comparison");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "+" &&
    left !== null &&
    right !== null &&
    isStringType(left) &&
    isStringType(right)
  ) {
    return { kind: "PrimitiveType", name: "string" };
  }

  if (
    expr.operator === "<<" ||
    expr.operator === ">>" ||
    expr.operator === "&" ||
    expr.operator === "^" ||
    expr.operator === "|"
  ) {
    if (left !== null && !isIntType(left)) {
      pushError(expr.left.line, expr.left.col, "type mismatch: expected int");
    }
    if (right !== null && !isIntType(right)) {
      pushError(expr.right.line, expr.right.col, "type mismatch: expected int");
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (left !== null && !isNumericType(left)) {
    pushError(expr.left.line, expr.left.col, "type mismatch: expected numeric");
  }
  if (right !== null && !isNumericType(right)) {
    pushError(expr.right.line, expr.right.col, "type mismatch: expected numeric");
  }
  if (left !== null && isDoubleType(left)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  if (right !== null && isDoubleType(right)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  return { kind: "PrimitiveType", name: "int" };
}

export function resolveConditionalType(
  thenType: TypeNode | null,
  elseType: TypeNode | null,
  line: number,
  col: number,
  pushError: PushErrorFn,
): TypeNode | null {
  if (thenType === null || elseType === null) {
    return null;
  }

  if (sameType(thenType, elseType)) {
    return thenType;
  }

  if (isPairType(thenType) && isPairType(elseType)) {
    const first = resolveConditionalType(
      pairFirstType(thenType), pairFirstType(elseType), line, col, pushError,
    );
    const second = resolveConditionalType(
      pairSecondType(thenType), pairSecondType(elseType), line, col, pushError,
    );
    if (first === null || second === null) {
      return null;
    }
    return pairType(first, second);
  }

  if (isTupleType(thenType) && isTupleType(elseType)) {
    const thenEls = tupleElementTypes(thenType);
    const elseEls = tupleElementTypes(elseType);
    if (thenEls.length !== elseEls.length) {
      pushError(
        line, col,
        `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
      );
      return null;
    }
    const elementTypes: TypeNode[] = [];
    for (let i = 0; i < thenEls.length; i += 1) {
      const l = thenEls[i];
      const r = elseEls[i];
      if (l === undefined || r === undefined) {
        return null;
      }
      const resolved = resolveConditionalType(l, r, line, col, pushError);
      if (resolved === null) {
        return null;
      }
      elementTypes.push(resolved);
    }
    return tupleType(elementTypes);
  }

  if (isPointerType(thenType) && isNullPointerType(elseType)) {
    return thenType;
  }
  if (isPointerType(elseType) && isNullPointerType(thenType)) {
    return elseType;
  }

  if (isNumericType(thenType) && isNumericType(elseType)) {
    if (isDoubleType(thenType) || isDoubleType(elseType)) {
      return { kind: "PrimitiveType", name: "double" };
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (isAssignable(thenType, elseType) && !isAssignable(elseType, thenType)) {
    return elseType;
  }
  if (isAssignable(elseType, thenType) && !isAssignable(thenType, elseType)) {
    return thenType;
  }

  pushError(
    line, col,
    `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
  );
  return null;
}
