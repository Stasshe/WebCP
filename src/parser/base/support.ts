import { isUnsupportedTemplateTypeName } from "@/stdlib/registry";
import type {
  ArrayDeclNode,
  AssignTargetNode,
  ExprNode,
  ForInitNode,
  RangeForStmtNode,
  Token,
  TypeNode,
  VarDeclNode,
  VectorDeclNode,
} from "@/types";
import { isVectorType } from "@/types";
import { BaseParserTypeSupport } from "./type-support";

export abstract class BaseParserSupport extends BaseParserTypeSupport {
  protected parseForInit(): ForInitNode {
    if (this.checkSymbol(";")) {
      this.advance();
      return { kind: "none" };
    }

    if (this.peekPrimitiveTypeKeyword()) {
      const decls = this.parseVarDeclListNoSemicolon();
      if (decls === null || decls.length === 0) {
        return { kind: "none" };
      }
      if (!this.consumeSymbol(";", "expected ';' after for initializer declaration")) {
        return { kind: "none" };
      }
      if (decls.length === 1) {
        return { kind: "varDecl", value: decls[0] as VarDeclNode };
      }
      return { kind: "declGroup", value: decls as VarDeclNode[] };
    }

    const value = this.parseExpression();
    if (!this.consumeSymbol(";", "expected ';' after for initializer")) {
      return { kind: "none" };
    }
    return { kind: "expr", value };
  }

  protected parseVarDeclNoSemicolon(): VarDeclNode | null {
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    return this.parseSingleVarDeclaratorFromBaseType(type);
  }

  protected parseVarDeclListNoSemicolon(): VarDeclNode[] | null {
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    return this.parseVarDeclaratorList(type);
  }

  protected parseDeclarationList(
    type: TypeNode,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations = this.parseDeclaratorList(type);
    if (declarations === null) {
      return null;
    }
    if (!this.consumeSymbol(";", "expected ';' after declaration")) {
      return null;
    }
    return declarations;
  }

  protected parseDeclaratorList(
    type: TypeNode,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations: Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> = [];
    const first = this.parseSingleDeclarator(type);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const next = this.parseSingleDeclarator(type);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseVarDeclaratorList(
    type: Extract<TypeNode, { kind: "PrimitiveType" }>,
  ): VarDeclNode[] | null {
    const declarations: VarDeclNode[] = [];
    const first = this.parseSingleVarDeclaratorFromBaseType(type);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const next = this.parseSingleVarDeclaratorFromBaseType(type);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseSingleDeclarator(
    type: TypeNode,
  ): VarDeclNode | ArrayDeclNode | VectorDeclNode | null {
    const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: false });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      return this.finishArrayDecl(
        declarator.type,
        declarator.nameToken,
        declarator.dimensions,
        false,
      );
    }
    if (isVectorType(declarator.type)) {
      return this.finishVectorDecl(declarator.type, declarator.nameToken, false);
    }
    return this.parseSingleVarDeclarator(declarator.type, declarator.nameToken);
  }

  protected parseSingleVarDeclarator(type: TypeNode, nameToken: Token): VarDeclNode | null {
    const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
    return {
      kind: "VarDecl",
      type,
      name: nameToken.text,
      initializer,
      ...(initializer === null
        ? this.rangeFrom(nameToken, nameToken)
        : this.rangeFromNode(nameToken, initializer)),
    };
  }

  protected finishArrayDecl(
    type: TypeNode,
    nameToken: Token,
    dimensions: bigint[],
    consumeTerminator = true,
  ): ArrayDeclNode | null {
    if (this.isVoidTypeNode(type)) {
      this.errorAt(nameToken, "array element type cannot be void");
      return null;
    }
    if (dimensions.length === 0) {
      this.errorAt(nameToken, "expected array size integer literal");
      return null;
    }

    const initializers: ExprNode[] = [];
    if (this.matchSymbol("=")) {
      if (!this.consumeSymbol("{", "expected '{' for array initializer")) {
        return null;
      }
      if (!this.checkSymbol("}")) {
        while (true) {
          initializers.push(this.parseExpression());
          if (!this.matchSymbol(",")) {
            break;
          }
        }
      }
      if (!this.consumeSymbol("}", "expected '}' after array initializer")) {
        return null;
      }
    }

    if (consumeTerminator && !this.consumeSymbol(";", "expected ';' after array declaration")) {
      return null;
    }

    return {
      kind: "ArrayDecl",
      type: this.wrapArrayDimensions(type, dimensions.length),
      name: nameToken.text,
      dimensions,
      initializers,
      ...this.rangeToPrevious(nameToken),
    };
  }

  protected finishVectorDecl(
    type: VectorDeclNode["type"],
    nameToken: Token,
    consumeTerminator = true,
  ): VectorDeclNode | null {
    const constructorArgs: ExprNode[] = [];
    if (this.matchSymbol("(")) {
      if (!this.matchSymbol(")")) {
        constructorArgs.push(this.parseExpression());
        if (this.matchSymbol(",")) {
          constructorArgs.push(this.parseExpression());
        }
        if (!this.consumeSymbol(")", "expected ')' after vector constructor args")) {
          return null;
        }
      }
    }

    if (consumeTerminator && !this.consumeSymbol(";", "expected ';' after vector declaration")) {
      return null;
    }

    return {
      kind: "VectorDecl",
      type,
      name: nameToken.text,
      constructorArgs,
      ...this.rangeToPrevious(nameToken),
    };
  }

  protected parseParams(): import("@/types").FunctionDeclNode["params"] {
    const params: import("@/types").FunctionDeclNode["params"] = [];

    if (this.matchSymbol(")")) {
      return params;
    }

    while (true) {
      const type = this.parseTypeSpecifier();
      if (type === null) {
        break;
      }
      const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: true });
      if (declarator === null) {
        break;
      }
      const paramType =
        declarator.dimensions.length > 0
          ? this.wrapArrayDimensions(declarator.type, declarator.dimensions.length)
          : declarator.type;
      params.push({
        kind: "Param",
        type: paramType,
        name: declarator.nameToken.text,
        ...this.rangeToPrevious(declarator.nameToken),
      });

      if (this.matchSymbol(")")) {
        return params;
      }
      if (!this.consumeSymbol(",", "expected ',' or ')' after parameter")) {
        break;
      }
    }

    this.consumeSymbol(")", "expected ')' after parameter list");
    return params;
  }

  protected isUnsupportedTemplateTypeDeclarationStart(): boolean {
    const token = this.peek();
    if (token.kind !== "identifier" || !isUnsupportedTemplateTypeName(token.text)) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    return next?.kind === "symbol" && next.text === "<";
  }

  protected parseRangeForStatement(forToken: Token): RangeForStmtNode | null {
    const binding = this.parseRangeForBinding();
    if (binding === null) {
      return null;
    }
    if (!this.consumeSymbol(":", "expected ':' in range-based for")) {
      return null;
    }
    const source = this.parseExpression();
    if (!this.consumeSymbol(")", "expected ')' after range-based for")) {
      return null;
    }
    const body = this.parseStmtOrBlock();
    if (body === null) {
      return null;
    }
    return {
      kind: "RangeForStmt",
      itemName: binding.name,
      itemType: binding.type,
      itemByReference: binding.byReference,
      source,
      body,
      ...this.rangeFromNode(forToken, body),
    };
  }

  protected isRangeForClause(): boolean {
    let depth = 0;
    for (let cursor = this.index; cursor < this.tokens.length; cursor += 1) {
      const token = this.tokens[cursor];
      if (token === undefined || token.kind === "eof") {
        return false;
      }
      if (token.kind !== "symbol") {
        continue;
      }
      if (token.text === "(" || token.text === "[" || token.text === "{") {
        depth += 1;
        continue;
      }
      if (token.text === ")" || token.text === "]" || token.text === "}") {
        if (depth === 0 && token.text === ")") {
          return false;
        }
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0 && token.text === ":") {
        return true;
      }
      if (depth === 0 && token.text === ";") {
        return false;
      }
    }
    return false;
  }

  private parseSingleVarDeclaratorFromBaseType(
    type: Extract<TypeNode, { kind: "PrimitiveType" }>,
  ): VarDeclNode | null {
    const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: false });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      this.errorAt(declarator.nameToken, "for-loop initializer variable cannot be array");
      return null;
    }
    return this.parseSingleVarDeclarator(declarator.type, declarator.nameToken);
  }

  private parseRangeForBinding(): {
    name: string;
    type: TypeNode | null;
    byReference: boolean;
  } | null {
    if (this.matchKeyword("auto")) {
      const byReference = this.matchSymbol("&");
      if (this.checkSymbol("[")) {
        this.errorAtCurrent("this feature is not supported in this interpreter");
        return null;
      }
      const nameToken = this.consumeIdentifier("expected loop variable name");
      if (nameToken === null) {
        return null;
      }
      return { name: nameToken.text, type: null, byReference };
    }
    const baseType = this.parseTypeSpecifier();
    if (baseType === null) {
      return null;
    }
    const declarator = this.parseNamedDeclarator(baseType, { allowUnsizedArrays: true });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      this.errorAt(declarator.nameToken, "range-based for variable cannot be array");
      return null;
    }
    return {
      name: declarator.nameToken.text,
      type:
        declarator.type.kind === "ReferenceType" ? declarator.type.referredType : declarator.type,
      byReference: declarator.type.kind === "ReferenceType",
    };
  }
}

export function isAssignTarget(expr: ExprNode): expr is AssignTargetNode {
  return (
    expr.kind === "Identifier" ||
    expr.kind === "IndexExpr" ||
    expr.kind === "DerefExpr" ||
    expr.kind === "TupleGetExpr"
  );
}
