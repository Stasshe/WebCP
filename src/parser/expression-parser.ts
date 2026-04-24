import type {
  AssignExprNode,
  BinaryExprNode,
  ExprNode,
  UnaryExprNode,
} from "../types";
import { BaseParser, isAssignTarget } from "./base-parser";

export abstract class ExpressionParser extends BaseParser {
  protected parseExpression(): ExprNode {
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
    const greaterComparator = this.parseGreaterComparator();
    if (greaterComparator !== null) {
      return greaterComparator;
    }

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

  private parseGreaterComparator(): ExprNode | null {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    if (
      token?.kind !== "identifier" ||
      token.text !== "greater" ||
      next?.kind !== "symbol" ||
      next.text !== "<"
    ) {
      return null;
    }

    this.advance();
    if (!this.consumeSymbol("<", "expected '<' after greater")) {
      return null;
    }
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    if (!this.consumeSymbol(">", "expected '>' after comparator type")) {
      return null;
    }
    if (!this.consumeSymbol("(", "expected '(' after comparator type")) {
      return null;
    }
    if (!this.consumeSymbol(")", "expected ')' after comparator")) {
      return null;
    }

    return {
      kind: "CallExpr",
      callee: "greater",
      args: [],
      line: token.line,
      col: token.col,
    };
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
}
