import type { CompileResult, GlobalDeclNode, ProgramNode, Token } from "@/types";
import { pointerType, referenceType } from "@/types";
import type { TemplateFunctionDeclNode } from "@/types";
import { tokensStart } from "./base/index";
import { ExpressionParser } from "./expression";

export function parse(tokens: Token[]): CompileResult {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

class Parser extends ExpressionParser {
  parseProgram(): CompileResult {
    const globals: GlobalDeclNode[] = [];
    const functions: ProgramNode["functions"] = [];

    while (!this.isAtEnd()) {
      if (this.matchKeyword("using")) {
        const namespaceOkay = this.consumeKeyword(
          "namespace",
          "expected 'namespace' after 'using'",
        );
        const namespaceName = namespaceOkay
          ? this.consumeIdentifier("expected namespace name")
          : null;
        const semicolonOkay =
          namespaceName !== null &&
          namespaceName.text === "std" &&
          this.consumeSymbol(";", "expected ';' after using directive");
        if (
          !namespaceOkay ||
          namespaceName === null ||
          namespaceName.text !== "std" ||
          !semicolonOkay
        ) {
          if (namespaceName !== null && namespaceName.text !== "std") {
            this.errorAt(namespaceName, "only 'using namespace std;' is supported");
          }
          this.synchronizeTopLevel();
        }
        continue;
      }

      if (this.checkKeyword("template")) {
        const templateDecl = this.parseTemplateFunction();
        if (templateDecl !== null) {
          functions.push(templateDecl);
        } else {
          this.synchronizeTopLevel();
        }
        continue;
      }

      if (!this.checkTypeStart()) {
        this.errorAtCurrent("expected type specifier");
        this.synchronizeTopLevel();
        continue;
      }

      const type = this.parseTypeSpecifier();
      if (type === null) {
        this.synchronizeTopLevel();
        continue;
      }

      let functionType = type;
      let cursor = this.index;
      while (this.tokens[cursor]?.kind === "symbol" && this.tokens[cursor]?.text === "*") {
        functionType = pointerType(functionType);
        cursor += 1;
      }
      if (this.tokens[cursor]?.kind === "symbol" && this.tokens[cursor]?.text === "&") {
        functionType = referenceType(functionType);
        cursor += 1;
      }

      const functionNameToken = this.tokens[cursor];
      if (functionNameToken?.kind !== "identifier") {
        this.errorAtCurrent("expected identifier");
        this.synchronizeTopLevel();
        continue;
      }
      const afterName = this.tokens[cursor + 1];
      if (afterName?.kind === "symbol" && afterName.text === "(") {
        this.index = cursor;
        this.advance();
        const nameToken = this.previous();
        this.advance();
        const params = this.parseParams();
        const body = this.parseRequiredBlock("expected block after function signature");
        if (body === null) {
          this.synchronizeTopLevel();
          continue;
        }
        functions.push({
          kind: "FunctionDecl",
          returnType: functionType,
          name: nameToken.text,
          params,
          body,
          ...this.rangeFromNode(nameToken, body),
        });
        continue;
      }

      const declarations = this.parseDeclarationList(type);
      if (declarations !== null) {
        globals.push(...declarations);
      } else {
        this.synchronizeTopLevel();
      }
    }

    if (!functions.some((f) => f.name === "main" && f.kind === "FunctionDecl")) {
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
      endLine: this.previous().endLine,
      endCol: this.previous().endCol,
    };

    return { ok: true, program };
  }

  private parseTemplateFunction(): TemplateFunctionDeclNode | null {
    const startToken = this.peek();
    this.advance(); // consume 'template'
    if (!this.consumeSymbol("<", "expected '<' after 'template'")) return null;

    const typeParams: string[] = [];
    while (!this.checkSymbol(">") && !this.isAtEnd()) {
      if (!this.consumeKeyword("typename", "expected 'typename' in template parameter list")) {
        return null;
      }
      const paramName = this.consumeIdentifier("expected type parameter name");
      if (paramName === null) return null;
      typeParams.push(paramName.text);
      if (!this.checkSymbol(">")) {
        if (!this.consumeSymbol(",", "expected ',' or '>' in template parameter list")) return null;
      }
    }
    if (!this.consumeSymbol(">", "expected '>' after template parameter list")) return null;

    if (typeParams.length === 0) {
      this.errorAtCurrent("template parameter list must not be empty");
      return null;
    }

    if (!this.checkTypeStart()) {
      this.errorAtCurrent("expected return type after template parameter list");
      return null;
    }
    const returnType = this.parseTypeSpecifier();
    if (returnType === null) return null;

    let functionType = returnType;
    let cursor = this.index;
    while (this.tokens[cursor]?.kind === "symbol" && this.tokens[cursor]?.text === "*") {
      functionType = pointerType(functionType);
      cursor += 1;
    }
    if (this.tokens[cursor]?.kind === "symbol" && this.tokens[cursor]?.text === "&") {
      functionType = referenceType(functionType);
      cursor += 1;
    }

    const nameToken = this.tokens[cursor];
    if (nameToken?.kind !== "identifier") {
      this.errorAtCurrent("expected function name");
      return null;
    }
    const afterName = this.tokens[cursor + 1];
    if (afterName?.kind !== "symbol" || afterName.text !== "(") {
      this.errorAtCurrent("expected '(' after function name");
      return null;
    }

    this.index = cursor;
    this.advance(); // name
    this.advance(); // (
    const params = this.parseParams();
    const body = this.parseRequiredBlock("expected block after function signature");
    if (body === null) return null;

    return {
      kind: "TemplateFunctionDecl",
      typeParams,
      returnType: functionType,
      name: nameToken.text,
      params,
      body,
      ...this.rangeFromNode(startToken, body),
    };
  }
}
