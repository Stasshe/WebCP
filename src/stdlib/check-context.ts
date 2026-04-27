import type { ExprNode, TypeNode } from "@/types";

export interface CheckCtx {
  pushError(line: number, col: number, message: string): void;
  validateExpr(expr: ExprNode | null, expected?: TypeNode | "bool" | "int"): TypeNode | null;
  inferExprType(expr: ExprNode): TypeNode | null;
  isAssignableExpr(expr: ExprNode): boolean;
  isAssignable(from: TypeNode, to: TypeNode): boolean;
}
