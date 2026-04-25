import type { CompileResult, GlobalDeclNode, ProgramNode, Token } from "../types";
import { pointerType, referenceType } from "../types";
import { tokensStart } from "./base-parser";
import { ExpressionParser } from "./expression-parser";

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
      endLine: this.previous().endLine,
      endCol: this.previous().endCol,
    };

    return { ok: true, program };
  }
}
