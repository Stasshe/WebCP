import type {
  ArrayDeclNode,
  AssignExprNode,
  AssignTargetNode,
  BinaryExprNode,
  BlockStmtNode,
  CompileError,
  CompileResult,
  ExprNode,
  ForInitNode,
  FunctionDeclNode,
  GlobalDeclNode,
  PrimitiveTypeName,
  ProgramNode,
  StatementNode,
  Token,
  UnaryExprNode,
  VarDeclNode,
  VectorDeclNode,
} from "../types";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "bool", "string", "void"]);

export function parse(tokens: Token[]): CompileResult {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

class Parser {
  private readonly tokens: Token[];

  private index = 0;

  private readonly errors: CompileError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(): CompileResult {
    const globals: GlobalDeclNode[] = [];
    const functions: FunctionDeclNode[] = [];

    while (!this.isAtEnd()) {
      if (this.checkKeyword("vector")) {
        const decl = this.parseVectorDecl();
        if (decl !== null) {
          globals.push(decl);
        } else {
          this.synchronizeTopLevel();
        }
        continue;
      }

      if (!this.peekTypeKeyword()) {
        this.errorAtCurrent("expected type specifier");
        this.synchronizeTopLevel();
        continue;
      }

      const typeName = this.parseTypeName();
      if (typeName === null) {
        this.synchronizeTopLevel();
        continue;
      }

      const nameToken = this.consumeIdentifier("expected identifier");
      if (nameToken === null) {
        this.synchronizeTopLevel();
        continue;
      }

      if (this.matchSymbol("(")) {
        const params = this.parseParams();
        const body = this.parseRequiredBlock("expected block after function signature");
        if (body === null) {
          this.synchronizeTopLevel();
          continue;
        }
        functions.push({
          kind: "FunctionDecl",
          returnType: typeName,
          name: nameToken.text,
          params,
          body,
          line: nameToken.line,
          col: nameToken.col,
        });
        continue;
      }

      if (this.matchSymbol("[")) {
        const arrayDecl = this.finishArrayDecl(typeName, nameToken);
        if (arrayDecl !== null) {
          globals.push(arrayDecl);
        } else {
          this.synchronizeTopLevel();
        }
        continue;
      }

      const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
      if (!this.consumeSymbol(";", "expected ';' after declaration")) {
        this.synchronizeTopLevel();
        continue;
      }
      globals.push({
        kind: "VarDecl",
        typeName,
        name: nameToken.text,
        initializer,
        line: nameToken.line,
        col: nameToken.col,
      });
    }

    if (!functions.some((f) => f.name === "main")) {
      this.errors.push({ line: 1, col: 1, message: "'main' function is required" });
    }

    if (this.errors.length > 0) {
      return { ok: false, errors: this.errors };
    }

    const start = tokensStart(this.tokens);
    const program: ProgramNode = {
      kind: "Program",
      globals,
      functions,
      line: start.line,
      col: start.col,
    };

    return { ok: true, program };
  }

  private parseParams(): FunctionDeclNode["params"] {
    const params: FunctionDeclNode["params"] = [];

    if (this.matchSymbol(")")) {
      return params;
    }

    while (true) {
      const typeName = this.parseTypeName();
      if (typeName === null) {
        break;
      }
      const nameToken = this.consumeIdentifier("expected parameter name");
      if (nameToken === null) {
        break;
      }
      params.push({
        kind: "Param",
        typeName,
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

  private parseRequiredBlock(errorMessage: string): BlockStmtNode | null {
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

  private parseStatement(): StatementNode | null {
    if (this.checkSymbol("{")) {
      return this.parseRequiredBlock("expected block");
    }

    if (this.checkKeyword("vector")) {
      return this.parseVectorDecl();
    }

    if (this.peekTypeKeyword()) {
      const typeName = this.parseTypeName();
      if (typeName === null) {
        return null;
      }
      const nameToken = this.consumeIdentifier("expected variable name");
      if (nameToken === null) {
        return null;
      }
      if (this.matchSymbol("[")) {
        return this.finishArrayDecl(typeName, nameToken);
      }
      const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
      if (!this.consumeSymbol(";", "expected ';' after variable declaration")) {
        return null;
      }
      return {
        kind: "VarDecl",
        typeName,
        name: nameToken.text,
        initializer,
        line: nameToken.line,
        col: nameToken.col,
      };
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
      const thenBlock = this.parseRequiredBlock("expected block after if");
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
        const elseIfBlock = this.parseRequiredBlock("expected block after else if");
        if (elseIfBlock === null) {
          return null;
        }
        branches.push({ condition: elseIfCondition, thenBlock: elseIfBlock });
      }

      if (this.matchKeyword("else")) {
        elseBlock = this.parseRequiredBlock("expected block after else");
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
      const body = this.parseRequiredBlock("expected block after while");
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

      const body = this.parseRequiredBlock("expected block after for");
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

  private parseForInit(): ForInitNode {
    if (this.checkSymbol(";")) {
      this.advance();
      return { kind: "none" };
    }

    if (this.peekTypeKeyword()) {
      const decl = this.parseVarDeclNoSemicolon();
      if (decl === null) {
        return { kind: "none" };
      }
      if (!this.consumeSymbol(";", "expected ';' after for initializer declaration")) {
        return { kind: "none" };
      }
      return { kind: "varDecl", value: decl };
    }

    const value = this.parseExpression();
    if (!this.consumeSymbol(";", "expected ';' after for initializer")) {
      return { kind: "none" };
    }
    return { kind: "expr", value };
  }

  private parseVarDeclNoSemicolon(): VarDeclNode | null {
    const typeName = this.parseTypeName();
    if (typeName === null) {
      return null;
    }

    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }

    const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
    return {
      kind: "VarDecl",
      typeName,
      name: nameToken.text,
      initializer,
      line: nameToken.line,
      col: nameToken.col,
    };
  }

  private finishArrayDecl(elementType: PrimitiveTypeName, nameToken: Token): ArrayDeclNode | null {
    if (elementType === "void") {
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

    if (!this.consumeSymbol(";", "expected ';' after array declaration")) {
      return null;
    }

    return {
      kind: "ArrayDecl",
      elementType,
      name: nameToken.text,
      size: BigInt(sizeToken.text),
      initializers,
      line: nameToken.line,
      col: nameToken.col,
    };
  }

  private parseVectorDecl(): VectorDeclNode | null {
    const vectorToken = this.peek();
    if (!this.consumeKeyword("vector", "expected 'vector'")) {
      return null;
    }
    if (!this.consumeSymbol("<", "expected '<' after vector")) {
      return null;
    }

    const elementType = this.parseTypeName();
    if (elementType === null) {
      return null;
    }
    if (elementType === "void") {
      this.errorAtCurrent("vector element type cannot be void");
      return null;
    }

    if (!this.consumeSymbol(">", "expected '>' after vector element type")) {
      return null;
    }

    const nameToken = this.consumeIdentifier("expected vector variable name");
    if (nameToken === null) {
      return null;
    }

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

    if (!this.consumeSymbol(";", "expected ';' after vector declaration")) {
      return null;
    }

    return {
      kind: "VectorDecl",
      elementType,
      name: nameToken.text,
      constructorArgs,
      line: vectorToken.line,
      col: vectorToken.col,
    };
  }

  private parseShiftExprList(symbol: "<<" | ">>", message: string): ExprNode[] | null {
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

  private parseExpression(): ExprNode {
    return this.parseAssignment();
  }

  private parseAssignment(): ExprNode {
    const left = this.parseLogicalOr();
    if (this.matchAnySymbol(["=", "+=", "-=", "*=", "/=", "%="])) {
      const opToken = this.previous();
      if (!isAssignTarget(left)) {
        this.errorAt(opToken, "left side of assignment must be an lvalue");
        return left;
      }
      const value = this.parseAssignment();
      const node: AssignExprNode = {
        kind: "AssignExpr",
        operator: opToken.text as AssignExprNode["operator"],
        target: left,
        value,
        line: opToken.line,
        col: opToken.col,
      };
      return node;
    }
    return left;
  }

  private parseLogicalOr(): ExprNode {
    return this.parseLeftAssociative(() => this.parseLogicalAnd(), ["||"]);
  }

  private parseLogicalAnd(): ExprNode {
    return this.parseLeftAssociative(() => this.parseEquality(), ["&&"]);
  }

  private parseEquality(): ExprNode {
    return this.parseLeftAssociative(() => this.parseRelational(), ["==", "!="]);
  }

  private parseRelational(): ExprNode {
    return this.parseLeftAssociative(() => this.parseAdditive(), ["<", "<=", ">", ">="]);
  }

  private parseAdditive(): ExprNode {
    return this.parseLeftAssociative(() => this.parseMultiplicative(), ["+", "-"]);
  }

  private parseMultiplicative(): ExprNode {
    return this.parseLeftAssociative(() => this.parseUnary(), ["*", "/", "%"]);
  }

  private parseUnary(): ExprNode {
    if (this.matchAnySymbol(["!", "-", "++", "--"])) {
      const op = this.previous();
      const operand = this.parseUnary();
      const node: UnaryExprNode = {
        kind: "UnaryExpr",
        operator: op.text as UnaryExprNode["operator"],
        operand,
        isPostfix: false,
        line: op.line,
        col: op.col,
      };
      return node;
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    const base = this.parsePrimary();
    if (base === null) {
      const token = this.peek();
      this.errorAt(token, "expected expression");
      return {
        kind: "Literal",
        valueType: "int",
        value: 0n,
        line: token.line,
        col: token.col,
      };
    }

    let expr: ExprNode = base;

    while (true) {
      if (this.matchSymbol("(")) {
        const args: ExprNode[] = [];
        if (!this.matchSymbol(")")) {
          while (true) {
            args.push(this.parseExpression());
            if (this.matchSymbol(")")) {
              break;
            }
            if (!this.consumeSymbol(",", "expected ',' or ')' in argument list")) {
              break;
            }
          }
        }

        if (expr.kind !== "Identifier") {
          this.errorAt(this.previous(), "invalid function call target");
          break;
        }

        expr = {
          kind: "CallExpr",
          callee: expr.name,
          args,
          line: expr.line,
          col: expr.col,
        };
        continue;
      }

      if (this.matchSymbol("[")) {
        const index = this.parseExpression();
        if (!this.consumeSymbol("]", "expected ']' after index expression")) {
          break;
        }
        expr = {
          kind: "IndexExpr",
          target: expr,
          index,
          line: expr.line,
          col: expr.col,
        };
        continue;
      }

      if (this.matchSymbol(".")) {
        const methodToken = this.consumeIdentifier("expected method name after '.'");
        if (methodToken === null) {
          break;
        }
        if (!this.consumeSymbol("(", "expected '(' after method name")) {
          break;
        }
        const args: ExprNode[] = [];
        if (!this.matchSymbol(")")) {
          while (true) {
            args.push(this.parseExpression());
            if (this.matchSymbol(")")) {
              break;
            }
            if (!this.consumeSymbol(",", "expected ',' or ')' in argument list")) {
              break;
            }
          }
        }
        expr = {
          kind: "MethodCallExpr",
          receiver: expr,
          method: methodToken.text,
          args,
          line: methodToken.line,
          col: methodToken.col,
        };
        continue;
      }

      if (this.matchAnySymbol(["++", "--"])) {
        const op = this.previous();
        expr = {
          kind: "UnaryExpr",
          operator: op.text as UnaryExprNode["operator"],
          operand: expr,
          isPostfix: true,
          line: op.line,
          col: op.col,
        };
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): ExprNode | null {
    if (this.match("number")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "int",
        value: BigInt(t.text),
        line: t.line,
        col: t.col,
      };
    }

    if (this.match("string")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "string",
        value: t.text,
        line: t.line,
        col: t.col,
      };
    }

    if (this.matchKeyword("true") || this.matchKeyword("false")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "bool",
        value: t.text === "true",
        line: t.line,
        col: t.col,
      };
    }

    if (this.match("identifier")) {
      const id = this.previous();
      return {
        kind: "Identifier",
        name: id.text,
        line: id.line,
        col: id.col,
      };
    }

    if (this.matchSymbol("(")) {
      const expr = this.parseExpression();
      this.consumeSymbol(")", "expected ')' after expression");
      return expr;
    }

    return null;
  }

  private parseLeftAssociative(parseOperand: () => ExprNode, operators: string[]): ExprNode {
    let expr = parseOperand();
    while (this.matchAnySymbol(operators)) {
      const op = this.previous();
      const right = parseOperand();
      expr = {
        kind: "BinaryExpr",
        operator: op.text as BinaryExprNode["operator"],
        left: expr,
        right,
        line: op.line,
        col: op.col,
      };
    }
    return expr;
  }

  private parseTypeName(): PrimitiveTypeName | null {
    if (this.matchKeyword("int")) {
      return "int";
    }
    if (this.matchKeyword("bool")) {
      return "bool";
    }
    if (this.matchKeyword("string")) {
      return "string";
    }
    if (this.matchKeyword("void")) {
      return "void";
    }
    if (this.matchKeyword("long")) {
      if (this.matchKeyword("long")) {
        return "long long";
      }
      this.errorAtCurrent("expected 'long' after 'long'");
      return null;
    }
    this.errorAtCurrent("expected type name");
    return null;
  }

  private peekTypeKeyword(): boolean {
    const token = this.peek();
    return token.kind === "keyword" && TYPE_KEYWORDS.has(token.text);
  }

  private consume(kind: Token["kind"], message: string): Token | null {
    if (this.match(kind)) {
      return this.previous();
    }
    this.errorAtCurrent(message);
    return null;
  }

  private consumeIdentifier(message: string): Token | null {
    return this.consume("identifier", message);
  }

  private consumeKeyword(keyword: string, message: string): boolean {
    if (this.matchKeyword(keyword)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  private consumeSymbol(symbol: string, message: string): boolean {
    if (this.matchSymbol(symbol)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  private match(kind: Token["kind"]): boolean {
    if (this.peek().kind !== kind) {
      return false;
    }
    this.advance();
    return true;
  }

  private matchSymbol(symbol: string): boolean {
    if (!this.checkSymbol(symbol)) {
      return false;
    }
    this.advance();
    return true;
  }

  private matchAnySymbol(symbols: string[]): boolean {
    for (const symbol of symbols) {
      if (this.checkSymbol(symbol)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (!this.checkKeyword(keyword)) {
      return false;
    }
    this.advance();
    return true;
  }

  private checkSymbol(symbol: string): boolean {
    const token = this.peek();
    return token.kind === "symbol" && token.text === symbol;
  }

  private checkKeyword(keyword: string): boolean {
    const token = this.peek();
    return token.kind === "keyword" && token.text === keyword;
  }

  private checkNextKeyword(keyword: string): boolean {
    const token = this.tokens[this.index + 1];
    return token?.kind === "keyword" && token.text === keyword;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.index += 1;
    }
    return this.previous();
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)] as Token;
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private isAtEnd(): boolean {
    return this.peek().kind === "eof";
  }

  private errorAtCurrent(message: string): void {
    this.errorAt(this.peek(), message);
  }

  private errorAt(token: Token, message: string): void {
    this.errors.push({ line: token.line, col: token.col, message });
  }

  private synchronizeTopLevel(): void {
    while (!this.isAtEnd()) {
      if (this.peekTypeKeyword() || this.checkKeyword("vector")) {
        return;
      }
      this.advance();
    }
  }

  private synchronizeStatement(): void {
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

function isAssignTarget(expr: ExprNode): expr is AssignTargetNode {
  return expr.kind === "Identifier" || expr.kind === "IndexExpr";
}

function tokensStart(tokens: Token[]): { line: number; col: number } {
  const first = tokens[0];
  if (first === undefined) {
    return { line: 1, col: 1 };
  }
  return { line: first.line, col: first.col };
}
