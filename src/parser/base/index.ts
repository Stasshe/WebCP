import type {
  ArrayDeclNode,
  AssignTargetNode,
  DeclGroupStmtNode,
  ExprNode,
  StatementNode,
  Token,
  VarDeclNode,
} from "@/types";
import { BaseParserSupport, isAssignTarget } from "./support";

export abstract class BaseParser extends BaseParserSupport {
  protected override parseStatement(): StatementNode | null {
    if (this.checkSymbol("{")) {
      return this.parseRequiredBlock("expected block");
    }

    if (this.checkTypeStart()) {
      const type = this.parseTypeSpecifier();
      if (type === null) {
        return null;
      }
      const declarations = this.parseDeclarationList(type);
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
          ...this.rangeFromNode(
            first,
            declarations[declarations.length - 1] as VarDeclNode | ArrayDeclNode,
          ),
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

      const branches: Array<{ condition: ExprNode; thenBlock: import("@/types").BlockStmtNode }> = [
        { condition, thenBlock },
      ];
      let elseBlock: import("@/types").BlockStmtNode | null = null;

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
        ...(elseBlock === null
          ? this.rangeFromNode(ifToken, thenBlock)
          : this.rangeFromNode(ifToken, elseBlock)),
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
        ...this.rangeFromNode(whileToken, body),
      };
    }

    if (this.matchKeyword("for")) {
      const forToken = this.previous();
      if (!this.consumeSymbol("(", "expected '(' after for")) {
        return null;
      }

      if (this.isRangeForClause()) {
        return this.parseRangeForStatement(forToken);
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
        ...this.rangeFromNode(forToken, body),
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
        ...this.rangeToPrevious(returnToken),
      };
    }

    if (this.matchKeyword("break")) {
      const breakToken = this.previous();
      if (!this.consumeSymbol(";", "expected ';' after break")) {
        return null;
      }
      return { kind: "BreakStmt", ...this.rangeToPrevious(breakToken) };
    }

    if (this.matchKeyword("continue")) {
      const continueToken = this.previous();
      if (!this.consumeSymbol(";", "expected ';' after continue")) {
        return null;
      }
      return { kind: "ContinueStmt", ...this.rangeToPrevious(continueToken) };
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
      return { kind: "CoutStmt", values, ...this.rangeToPrevious(token) };
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
      return { kind: "CerrStmt", values, ...this.rangeToPrevious(token) };
    }

    if (this.matchKeyword("cin")) {
      const token = this.previous();
      const parsedTargets = this.parseShiftExprList(">>", "expected '>>' in cin statement");
      if (parsedTargets === null) {
        return null;
      }
      const targets: AssignTargetNode[] = [];
      for (const expr of parsedTargets) {
        if (!isAssignTarget(expr)) {
          this.errorAtCurrent("cin target must be an lvalue");
          return null;
        }
        targets.push(expr);
      }
      if (!this.consumeSymbol(";", "expected ';' after cin statement")) {
        return null;
      }
      return { kind: "CinStmt", targets, ...this.rangeToPrevious(token) };
    }

    if (this.isUnsupportedTemplateTypeDeclarationStart()) {
      this.errorAtCurrent("this feature is not supported in this interpreter");
      return null;
    }

    const expression = this.parseExpression();
    if (!this.consumeSymbol(";", "expected ';' after expression")) {
      return null;
    }
    return {
      kind: "ExprStmt",
      expression,
      ...this.rangeFromNode(expression, this.previous()),
    };
  }
}

export { isAssignTarget };

export function tokensStart(tokens: Token[]): { line: number; col: number } {
  const first = tokens[0];
  if (first === undefined) {
    return { line: 1, col: 1 };
  }
  return { line: first.line, col: first.col };
}
