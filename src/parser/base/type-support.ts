import type { ArrayDeclNode, PrimitiveTypeNode, Token, TypeNode } from "@/types";
import {
  arrayType,
  isPrimitiveType,
  isTemplateInstanceType,
  pointerType,
  templateInstanceType,
  primitiveType,
  referenceType,
} from "@/types";
import { BaseParserCore } from "./core";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "double", "bool", "char", "string", "void"]);

export abstract class BaseParserTypeSupport extends BaseParserCore {
  protected parseType(): TypeNode | null {
    const token = this.peek();
    if (
      token.kind === "identifier" &&
      this.activeTypeParams.length > 0 &&
      this.activeTypeParams.includes(token.text)
    ) {
      this.advance();
      return { kind: "NamedType", name: token.text };
    }
    const templateType = this.parseTemplateInstanceType();
    if (templateType !== null) {
      return templateType;
    }
    return this.parsePrimitiveType();
  }

  protected parseTypeSpecifier(): TypeNode | null {
    return this.parseType();
  }

  protected parsePrimitiveType(): PrimitiveTypeNode | null {
    if (this.matchKeyword("int")) {
      return primitiveType("int");
    }
    if (this.matchKeyword("bool")) {
      return primitiveType("bool");
    }
    if (this.matchKeyword("char")) {
      return primitiveType("char");
    }
    if (this.matchKeyword("double")) {
      return primitiveType("double");
    }
    if (this.matchKeyword("string")) {
      return primitiveType("string");
    }
    if (this.matchKeyword("void")) {
      return primitiveType("void");
    }
    if (this.matchKeyword("long")) {
      if (this.matchKeyword("long")) {
        return primitiveType("long long");
      }
      this.errorAtCurrent("expected 'long' after 'long'");
      return null;
    }
    this.errorAtCurrent("expected type name");
    return null;
  }

  protected peekPrimitiveTypeKeyword(): boolean {
    const token = this.peek();
    return token.kind === "keyword" && TYPE_KEYWORDS.has(token.text);
  }

  protected override checkTypeStart(): boolean {
    if (this.peekPrimitiveTypeKeyword() || this.peekTemplateTypeName() !== null) return true;
    if (this.activeTypeParams.length > 0) {
      const token = this.peek();
      return token.kind === "identifier" && this.activeTypeParams.includes(token.text);
    }
    return false;
  }

  protected checkTypeStartWithParams(typeParams: string[]): boolean {
    if (this.checkTypeStart()) return true;
    const token = this.peek();
    return token.kind === "identifier" && typeParams.includes(token.text);
  }

  protected parseTypeWithParams(typeParams: string[]): TypeNode | null {
    const token = this.peek();
    if (token.kind === "identifier" && typeParams.includes(token.text)) {
      this.advance();
      return { kind: "NamedType", name: token.text };
    }
    return this.parseType();
  }

  protected wrapArrayDimensions(type: TypeNode, dimensions: number): ArrayDeclNode["type"] {
    let wrapped: TypeNode = type;
    for (let i = 0; i < dimensions; i += 1) {
      wrapped = arrayType(wrapped);
    }
    return wrapped as ArrayDeclNode["type"];
  }

  protected isVoidTypeNode(type: TypeNode): boolean {
    if (isPrimitiveType(type)) {
      return type.name === "void";
    }
    if (type.kind === "PointerType") {
      return this.isVoidTypeNode(type.pointeeType);
    }
    if (type.kind === "ReferenceType") {
      return this.isVoidTypeNode(type.referredType);
    }
    if (isTemplateInstanceType(type)) {
      return type.templateArgs.some((templateArg) => this.isVoidTypeNode(templateArg));
    }
    if (type.kind === "ArrayType") {
      return this.isVoidTypeNode(type.elementType);
    }
    return false;
  }

  protected consumeTypeClose(message: string): boolean {
    this.splitShiftCloseToken();
    return this.consumeSymbol(">", message);
  }

  protected splitShiftCloseToken(): void {
    const token = this.peek();
    if (token.kind !== "symbol" || token.text !== ">>") {
      return;
    }
    (this.tokens as Token[]).splice(
      this.index,
      1,
      { ...token, text: ">", endCol: token.col + 1 },
      { ...token, col: token.col + 1, endCol: token.endCol, text: ">" },
    );
  }

  protected parseNamedDeclarator(
    baseType: TypeNode,
    options: { allowUnsizedArrays: boolean },
  ): { nameToken: Token; type: TypeNode; dimensions: bigint[] } | null {
    let declaredType: TypeNode = baseType;
    while (this.matchSymbol("*")) {
      declaredType = pointerType(declaredType);
    }
    if (this.matchSymbol("&")) {
      declaredType = referenceType(declaredType);
    }
    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }
    const dimensions = this.checkSymbol("[")
      ? this.parseArrayDimensions(
          options.allowUnsizedArrays ? "parameter" : "array",
          !options.allowUnsizedArrays,
        )
      : [];
    if (dimensions === null) {
      return null;
    }
    return { nameToken, type: declaredType, dimensions };
  }

  protected peekTemplateTypeName(): string | null {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    if (
      (token.kind === "identifier" || token.kind === "keyword") &&
      next?.kind === "symbol" &&
      next.text === "<" &&
      !this.isTemplateCallLikeSequence()
    ) {
      return token.text;
    }
    return null;
  }

  private isTemplateCallLikeSequence(): boolean {
    let depth = 0;
    let cursor = this.index + 1;

    while (cursor < this.tokens.length) {
      const token = this.tokens[cursor];
      if (token === undefined) {
        return false;
      }
      if (token.kind === "symbol") {
        if (token.text === "<") {
          depth += 1;
        } else if (token.text === ">>") {
          depth -= 2;
        } else if (token.text === ">") {
          depth -= 1;
        }
        if (depth <= 0) {
          const after = this.tokens[cursor + 1];
          return after?.kind === "symbol" && after.text === "(";
        }
      }
      cursor += 1;
    }
    return false;
  }

  protected parseTemplateInstanceType(): TypeNode | null {
    const templateTypeName = this.peekTemplateTypeName();
    if (templateTypeName === null) {
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", `expected '<' after ${templateTypeName}`)) {
      return null;
    }

    const templateArgs = this.parseTemplateTypeArguments(templateTypeName);
    if (templateArgs === null) {
      return null;
    }

    if (!this.consumeTypeClose(`expected '>' after ${templateTypeName} type`)) {
      return null;
    }
    return templateInstanceType({ kind: "NamedType", name: templateTypeName }, templateArgs);
  }

  private parseTemplateTypeArguments(templateName: string): TypeNode[] | null {
    const templateArgs: TypeNode[] = [];

    while (true) {
      const templateArg = this.parseType();
      if (templateArg === null) {
        return null;
      }
      if (this.isVoidTypeNode(templateArg)) {
        this.errorAtCurrent(`${templateName} template argument cannot be void`);
        return null;
      }
      templateArgs.push(templateArg);

      this.splitShiftCloseToken();
      if (this.checkSymbol(">")) {
        break;
      }
      if (!this.consumeSymbol(",", `expected ',' in ${templateName} type`)) {
        return null;
      }
    }

    if (templateArgs.length === 0) {
      this.errorAtCurrent(`${templateName} must have at least one template argument`);
      return null;
    }

    return templateArgs;
  }

  private parseArrayDimensions(
    contextName: "array" | "parameter",
    requireSize: boolean,
  ): bigint[] | null {
    const dimensions: bigint[] = [];

    while (this.matchSymbol("[")) {
      if (this.checkSymbol("]")) {
        if (requireSize) {
          this.errorAtCurrent(`expected ${contextName} size integer literal`);
          return null;
        }
        this.advance();
        dimensions.push(0n);
        continue;
      }

      const sizeToken = this.consume("number", `expected ${contextName} size integer literal`);
      if (sizeToken === null) {
        return null;
      }
      dimensions.push(BigInt(sizeToken.text));
      if (!this.consumeSymbol("]", "expected ']' after array size")) {
        return null;
      }
    }

    return dimensions;
  }
}
