import type {
  ArrayDeclNode,
  AssignTargetNode,
  BlockStmtNode,
  CompileError,
  DeclGroupStmtNode,
  ExprNode,
  ForInitNode,
  FunctionDeclNode,
  PrimitiveTypeNode,
  StatementNode,
  Token,
  TypeNode,
  VarDeclNode,
  VectorDeclNode,
} from "../types";
import { arrayType, isPrimitiveType, primitiveType, vectorType } from "../types";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "bool", "string", "void"]);

export abstract class BaseParser {
  protected readonly tokens: Token[];

  protected index = 0;

  protected readonly errors: CompileError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  protected abstract parseExpression(): ExprNode;

  protected parseParams(): FunctionDeclNode["params"] {
    const params: FunctionDeclNode["params"] = [];

    if (this.matchSymbol(")")) {
      return params;
    }

    while (true) {
      const type = this.parseType();
      if (type === null) {
        break;
      }
      const nameToken = this.consumeIdentifier("expected parameter name");
      if (nameToken === null) {
        break;
      }
      let paramType = type;
      if (isPrimitiveType(type) && type.name !== "void" && this.matchSymbol("[")) {
        this.consumeSymbol("]", "expected ']' after array parameter");
        paramType = arrayType(type);
      }
      params.push({
        kind: "Param",
        type: paramType,
        name: nameToken.text,
        line: nameToken.line,
        col: nameToken.col,
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

  protected parseRequiredBlock(errorMessage: string): BlockStmtNode | null {
    if (!this.consumeSymbol("{", errorMessage)) {
      return null;
    }

    const open = this.previous();
    const statements: StatementNode[] = [];
    while (!this.checkSymbol("}") && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt === null) {
        this.synchronizeStatement();
      } else {
        statements.push(stmt);
      }
    }

    if (!this.consumeSymbol("}", "expected '}' after block")) {
      return null;
    }

    return {
      kind: "BlockStmt",
      statements,
      line: open.line,
      col: open.col,
    };
  }

  protected parseStmtOrBlock(): BlockStmtNode | null {
    if (this.checkSymbol("{")) {
      return this.parseRequiredBlock("expected block");
    }
    const stmt = this.parseStatement();
    if (stmt === null) {
      return null;
    }
    return {
      kind: "BlockStmt",
      statements: [stmt],
      line: stmt.line,
      col: stmt.col,
    };
  }

  protected parseStatement(): StatementNode | null {
    if (this.checkSymbol("{")) {
      return this.parseRequiredBlock("expected block");
    }

    if (this.checkTypeStart()) {
      const type = this.parseType();
      if (type === null) {
        return null;
      }
      const nameToken = this.consumeIdentifier("expected variable name");
      if (nameToken === null) {
        return null;
      }
      const declarations = this.parseDeclarationList(type, nameToken);
      if (declarations === null) {
        return null;
      }
      if (declarations.length === 1) {
        return declarations[0] as StatementNode;
      }
      const first = declarations[0] as StatementNode;
      const group: DeclGroupStmtNode = {
        kind: "DeclGroupStmt",
        declarations,
        line: first.line,
        col: first.col,
      };
      return group;
    }

    if (this.matchKeyword("if")) {
      const ifToken = this.previous();
      if (!this.consumeSymbol("(", "expected '(' after if")) {
        return null;
      }
      const condition = this.parseExpression();
      if (!this.consumeSymbol(")", "expected ')' after if condition")) {
        return null;
      }
      const thenBlock = this.parseStmtOrBlock();
      if (thenBlock === null) {
        return null;
      }

      const branches: Array<{ condition: ExprNode; thenBlock: BlockStmtNode }> = [
        { condition, thenBlock },
      ];
      let elseBlock: BlockStmtNode | null = null;

      while (this.checkKeyword("else") && this.checkNextKeyword("if")) {
        this.advance();
        this.advance();
        if (!this.consumeSymbol("(", "expected '(' after else if")) {
          return null;
        }
        const elseIfCondition = this.parseExpression();
        if (!this.consumeSymbol(")", "expected ')' after else-if condition")) {
          return null;
        }
        const elseIfBlock = this.parseStmtOrBlock();
        if (elseIfBlock === null) {
          return null;
        }
        branches.push({ condition: elseIfCondition, thenBlock: elseIfBlock });
      }

      if (this.matchKeyword("else")) {
        elseBlock = this.parseStmtOrBlock();
        if (elseBlock === null) {
          return null;
        }
      }

      return {
        kind: "IfStmt",
        branches,
        elseBlock,
        line: ifToken.line,
        col: ifToken.col,
      };
    }

    if (this.matchKeyword("while")) {
      const whileToken = this.previous();
      if (!this.consumeSymbol("(", "expected '(' after while")) {
        return null;
      }
      const condition = this.parseExpression();
      if (!this.consumeSymbol(")", "expected ')' after while condition")) {
        return null;
      }
      const body = this.parseStmtOrBlock();
      if (body === null) {
        return null;
      }
      return {
        kind: "WhileStmt",
        condition,
        body,
        line: whileToken.line,
        col: whileToken.col,
      };
    }

    if (this.matchKeyword("for")) {
      const forToken = this.previous();
      if (!this.consumeSymbol("(", "expected '(' after for")) {
        return null;
      }

      const init = this.parseForInit();
      const condition = this.checkSymbol(";") ? null : this.parseExpression();
      if (!this.consumeSymbol(";", "expected ';' after for condition")) {
        return null;
      }
      const update = this.checkSymbol(")") ? null : this.parseExpression();
      if (!this.consumeSymbol(")", "expected ')' after for clause")) {
        return null;
      }

      const body = this.parseStmtOrBlock();
      if (body === null) {
        return null;
      }

      return {
        kind: "ForStmt",
        init,
        condition,
        update,
        body,
        line: forToken.line,
        col: forToken.col,
      };
    }

    if (this.matchKeyword("return")) {
      const returnToken = this.previous();
      const value = this.checkSymbol(";") ? null : this.parseExpression();
      if (!this.consumeSymbol(";", "expected ';' after return")) {
        return null;
      }
      return {
        kind: "ReturnStmt",
        value,
        line: returnToken.line,
        col: returnToken.col,
      };
    }

    if (this.matchKeyword("break")) {
      const breakToken = this.previous();
      if (!this.consumeSymbol(";", "expected ';' after break")) {
        return null;
      }
      return { kind: "BreakStmt", line: breakToken.line, col: breakToken.col };
    }

    if (this.matchKeyword("continue")) {
      const continueToken = this.previous();
      if (!this.consumeSymbol(";", "expected ';' after continue")) {
        return null;
      }
      return { kind: "ContinueStmt", line: continueToken.line, col: continueToken.col };
    }

    if (this.matchKeyword("cout")) {
      const token = this.previous();
      const values = this.parseShiftExprList("<<", "expected '<<' followed by expression in cout");
      if (values === null) {
        return null;
      }
      if (!this.consumeSymbol(";", "expected ';' after cout statement")) {
        return null;
      }
      return { kind: "CoutStmt", values, line: token.line, col: token.col };
    }

    if (this.matchKeyword("cerr")) {
      const token = this.previous();
      const values = this.parseShiftExprList("<<", "expected '<<' followed by expression in cerr");
      if (values === null) {
        return null;
      }
      if (!this.consumeSymbol(";", "expected ';' after cerr statement")) {
        return null;
      }
      return { kind: "CerrStmt", values, line: token.line, col: token.col };
    }

    if (this.matchKeyword("cin")) {
      const token = this.previous();
      const targets: AssignTargetNode[] = [];
      if (!this.consumeSymbol(">>", "expected '>>' in cin statement")) {
        return null;
      }
      while (true) {
        const expr = this.parseExpression();
        if (!isAssignTarget(expr)) {
          this.errorAtCurrent("cin target must be an lvalue");
          return null;
        }
        targets.push(expr);
        if (!this.matchSymbol(">>")) {
          break;
        }
      }
      if (!this.consumeSymbol(";", "expected ';' after cin statement")) {
        return null;
      }
      return { kind: "CinStmt", targets, line: token.line, col: token.col };
    }

    const expression = this.parseExpression();
    if (!this.consumeSymbol(";", "expected ';' after expression")) {
      return null;
    }
    return {
      kind: "ExprStmt",
      expression,
      line: expression.line,
      col: expression.col,
    };
  }

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

    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }

    const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
    return {
      kind: "VarDecl",
      type,
      name: nameToken.text,
      initializer,
      line: nameToken.line,
      col: nameToken.col,
    };
  }

  protected parseVarDeclListNoSemicolon(): VarDeclNode[] | null {
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }
    const declarations = this.parseVarDeclaratorList(type, nameToken);
    return declarations;
  }

  protected parseDeclarationList(
    type: TypeNode,
    firstNameToken: Token,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations = this.parseDeclaratorList(type, firstNameToken);
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
    firstNameToken: Token,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations: Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> = [];
    const first = this.parseSingleDeclarator(type, firstNameToken);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const nameToken = this.consumeIdentifier("expected variable name");
      if (nameToken === null) {
        return null;
      }
      const next = this.parseSingleDeclarator(type, nameToken);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseVarDeclaratorList(type: PrimitiveTypeNode, firstNameToken: Token): VarDeclNode[] | null {
    const declarations: VarDeclNode[] = [];
    const first = this.parseSingleVarDeclarator(type, firstNameToken);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const nameToken = this.consumeIdentifier("expected variable name");
      if (nameToken === null) {
        return null;
      }
      const next = this.parseSingleVarDeclarator(type, nameToken);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseSingleDeclarator(
    type: TypeNode,
    nameToken: Token,
  ): VarDeclNode | ArrayDeclNode | VectorDeclNode | null {
    if (this.matchSymbol("[")) {
      return this.finishArrayDecl(type, nameToken, false);
    }
    if (type.kind === "VectorType") {
      return this.finishVectorDecl(type, nameToken, false);
    }
    if (!isPrimitiveType(type)) {
      this.errorAt(nameToken, `invalid declarator for type '${type.kind}'`);
      return null;
    }
    return this.parseSingleVarDeclarator(type, nameToken);
  }

  protected parseSingleVarDeclarator(type: PrimitiveTypeNode, nameToken: Token): VarDeclNode | null {
    const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
    return {
      kind: "VarDecl",
      type,
      name: nameToken.text,
      initializer,
      line: nameToken.line,
      col: nameToken.col,
    };
  }

  protected finishArrayDecl(type: TypeNode, nameToken: Token, consumeTerminator = true): ArrayDeclNode | null {
    if (!isPrimitiveType(type)) {
      this.errorAt(nameToken, "array element type must be primitive");
      return null;
    }
    if (type.name === "void") {
      this.errorAt(nameToken, "array element type cannot be void");
      return null;
    }

    const sizeToken = this.consume("number", "expected array size integer literal");
    if (sizeToken === null) {
      return null;
    }

    if (!this.consumeSymbol("]", "expected ']' after array size")) {
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
      type: arrayType(type),
      name: nameToken.text,
      size: BigInt(sizeToken.text),
      initializers,
      line: nameToken.line,
      col: nameToken.col,
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
      line: nameToken.line,
      col: nameToken.col,
    };
  }

  protected parseShiftExprList(symbol: "<<" | ">>", message: string): ExprNode[] | null {
    const values: ExprNode[] = [];
    if (!this.consumeSymbol(symbol, message || `expected '${symbol}'`)) {
      return null;
    }
    while (true) {
      values.push(this.parseExpression());
      if (!this.matchSymbol(symbol)) {
        break;
      }
    }
    return values;
  }

  protected parseType(): TypeNode | null {
    if (this.checkKeyword("vector")) {
      return this.parseVectorType();
    }
    return this.parsePrimitiveType();
  }

  protected parseVectorType(): VectorDeclNode["type"] | null {
    if (!this.consumeKeyword("vector", "expected 'vector'")) {
      return null;
    }
    if (!this.consumeSymbol("<", "expected '<' after vector")) {
      return null;
    }
    const elementType = this.parsePrimitiveType();
    if (elementType === null) {
      return null;
    }
    if (elementType.name === "void") {
      this.errorAtCurrent("vector element type cannot be void");
      return null;
    }
    if (!this.consumeSymbol(">", "expected '>' after vector element type")) {
      return null;
    }
    return vectorType(elementType);
  }

  protected parsePrimitiveType(): PrimitiveTypeNode | null {
    if (this.matchKeyword("int")) {
      return primitiveType("int");
    }
    if (this.matchKeyword("bool")) {
      return primitiveType("bool");
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

  protected checkTypeStart(): boolean {
    return this.peekPrimitiveTypeKeyword() || this.checkKeyword("vector");
  }

  protected consume(kind: Token["kind"], message: string): Token | null {
    if (this.match(kind)) {
      return this.previous();
    }
    this.errorAtCurrent(message);
    return null;
  }

  protected consumeIdentifier(message: string): Token | null {
    return this.consume("identifier", message);
  }

  protected consumeKeyword(keyword: string, message: string): boolean {
    if (this.matchKeyword(keyword)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  protected consumeSymbol(symbol: string, message: string): boolean {
    if (this.matchSymbol(symbol)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  protected match(kind: Token["kind"]): boolean {
    if (this.peek().kind !== kind) {
      return false;
    }
    this.advance();
    return true;
  }

  protected matchSymbol(symbol: string): boolean {
    if (!this.checkSymbol(symbol)) {
      return false;
    }
    this.advance();
    return true;
  }

  protected matchAnySymbol(symbols: string[]): boolean {
    for (const symbol of symbols) {
      if (this.checkSymbol(symbol)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  protected matchKeyword(keyword: string): boolean {
    if (!this.checkKeyword(keyword)) {
      return false;
    }
    this.advance();
    return true;
  }

  protected checkSymbol(symbol: string): boolean {
    const token = this.peek();
    return token.kind === "symbol" && token.text === symbol;
  }

  protected checkKeyword(keyword: string): boolean {
    const token = this.peek();
    return token.kind === "keyword" && token.text === keyword;
  }

  protected checkNextKeyword(keyword: string): boolean {
    const token = this.tokens[this.index + 1];
    return token?.kind === "keyword" && token.text === keyword;
  }

  protected advance(): Token {
    if (!this.isAtEnd()) {
      this.index += 1;
    }
    return this.previous();
  }

  protected previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)] as Token;
  }

  protected peek(): Token {
    return this.tokens[this.index] as Token;
  }

  protected isAtEnd(): boolean {
    return this.peek().kind === "eof";
  }

  protected errorAtCurrent(message: string): void {
    this.errorAt(this.peek(), message);
  }

  protected errorAt(token: Token, message: string): void {
    this.errors.push({ line: token.line, col: token.col, message });
  }

  protected synchronizeTopLevel(): void {
    while (!this.isAtEnd()) {
      if (this.checkTypeStart() || this.checkKeyword("using")) {
        return;
      }
      this.advance();
    }
  }

  protected synchronizeStatement(): void {
    while (!this.isAtEnd()) {
      if (this.previous().kind === "symbol" && this.previous().text === ";") {
        return;
      }
      if (this.peek().kind === "symbol" && this.peek().text === "}") {
        return;
      }
      this.advance();
    }
  }
}

export function isAssignTarget(expr: ExprNode): expr is AssignTargetNode {
  return expr.kind === "Identifier" || expr.kind === "IndexExpr";
}

export function tokensStart(tokens: Token[]): { line: number; col: number } {
  const first = tokens[0];
  if (first === undefined) {
    return { line: 1, col: 1 };
  }
  return { line: first.line, col: first.col };
}
