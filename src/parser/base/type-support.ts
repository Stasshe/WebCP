import { getSupportedTemplateTypeSpec } from "@/stdlib/registry";
import {
  mapKeyType,
  mapValueType,
  pairFirstType,
  pairSecondType,
  tupleElementTypes,
  vectorElementType,
} from "@/stdlib/template-types";
import type { ArrayDeclNode, PrimitiveTypeNode, Token, TypeNode, VectorDeclNode } from "@/types";
import {
  arrayType,
  isMapType,
  isPairType,
  isPrimitiveType,
  isTupleType,
  isVectorType,
  mapType,
  pairType,
  pointerType,
  primitiveType,
  referenceType,
  tupleType,
  vectorType,
} from "@/types";
import { BaseParserCore } from "./core";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "double", "bool", "char", "string", "void"]);

export abstract class BaseParserTypeSupport extends BaseParserCore {
  private isTemplateTypeToken(name: "vector" | "map" | "pair" | "tuple"): boolean {
    const token = this.peek();
    return (token.kind === "identifier" || token.kind === "keyword") && token.text === name;
  }

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
    const templateType = this.parseSupportedTemplateType();
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
    if (this.peekPrimitiveTypeKeyword() || this.peekSupportedTemplateTypeName() !== null)
      return true;
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
    if (isPairType(type)) {
      return this.isVoidTypeNode(pairFirstType(type)) || this.isVoidTypeNode(pairSecondType(type));
    }
    if (isMapType(type)) {
      return this.isVoidTypeNode(mapKeyType(type)) || this.isVoidTypeNode(mapValueType(type));
    }
    if (isTupleType(type)) {
      return tupleElementTypes(type).some((elementType) => this.isVoidTypeNode(elementType));
    }
    if (type.kind === "ArrayType" || isVectorType(type)) {
      return this.isVoidTypeNode(
        type.kind === "ArrayType" ? type.elementType : vectorElementType(type),
      );
    }
    this.errorAtCurrent("unsupported template type in void check");
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

  protected peekSupportedTemplateTypeName(): "vector" | "map" | "pair" | "tuple" | null {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    const spec =
      token.kind === "identifier" || token.kind === "keyword"
        ? getSupportedTemplateTypeSpec(token.text)
        : null;
    if (spec !== null && next?.kind === "symbol" && next.text === "<") {
      return spec.name;
    }
    return null;
  }

  protected parseVectorType(): VectorDeclNode["type"] | null {
    const type = this.parseSupportedTemplateType();
    return type !== null && isVectorType(type) ? type : null;
  }

  protected parseSupportedTemplateType(): TypeNode | null {
    const templateTypeName = this.peekSupportedTemplateTypeName();
    if (templateTypeName === null) {
      return null;
    }
    const spec = getSupportedTemplateTypeSpec(templateTypeName);
    if (spec === null) {
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", `expected '<' after ${spec.name}`)) {
      return null;
    }

    const templateArgs = this.parseTemplateTypeArguments(spec.name);
    if (templateArgs === null) {
      return null;
    }

    if (!this.consumeTypeClose(`expected '>' after ${spec.name} type`)) {
      return null;
    }

    if (spec.arity >= 0 && templateArgs.length !== spec.arity) {
      this.errorAtCurrent(`${spec.name} requires ${spec.arity.toString()} template argument(s)`);
      return null;
    }

    switch (spec.name) {
      case "vector": {
        const elementType = templateArgs[0];
        if (elementType === undefined) {
          return null;
        }
        return vectorType(elementType);
      }
      case "map": {
        const keyType = templateArgs[0];
        const valueType = templateArgs[1];
        if (keyType === undefined || valueType === undefined) {
          return null;
        }
        return mapType(keyType, valueType);
      }
      case "pair": {
        const firstType = templateArgs[0];
        const secondType = templateArgs[1];
        if (firstType === undefined || secondType === undefined) {
          return null;
        }
        return pairType(firstType, secondType);
      }
      case "tuple":
        return tupleType(templateArgs);
    }
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
