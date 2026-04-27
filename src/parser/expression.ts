import { getBuiltinTemplateComparatorSpec } from "@/stdlib/registry";
import type {
  AddressOfExprNode,
  AssignExprNode,
  BinaryExprNode,
  ConditionalExprNode,
  DerefExprNode,
  ExprNode,
  TemplateArgNode,
  TemplateIdExprNode,
  UnaryExprNode,
} from "@/types";
import { BaseParser, isAssignTarget } from "./base";

export abstract class ExpressionParser extends BaseParser {
  protected parseExpression(): ExprNode {
    return this.parseAssignment();
  }

  protected parseShiftExprList(symbol: "<<" | ">>", message: string): ExprNode[] | null {
    const values: ExprNode[] = [];
    if (!this.consumeSymbol(symbol, message || `expected '${symbol}'`)) {
      return null;
    }

    while (true) {
      const endIndex = this.findStreamOperandEnd(symbol);
      if (endIndex === this.index) {
        this.errorAtCurrent(`expected expression after '${symbol}'`);
        return null;
      }

      const segment = this.tokens.slice(this.index, endIndex);
      const eof = this.tokens[endIndex] ??
        this.tokens[this.tokens.length - 1] ?? {
          kind: "eof" as const,
          text: "<eof>",
          line: 1,
          col: 1,
          endLine: 1,
          endCol: 1,
        };
      const segmentParser = new StreamOperandParser([
        ...segment,
        {
          kind: "eof",
          text: "<eof>",
          line: eof.line,
          col: eof.col,
          endLine: eof.endLine,
          endCol: eof.endCol,
        },
      ]);
      const parsed = segmentParser.parseOperand();
      if (parsed === null) {
        this.errors.push(...segmentParser.getErrors());
        return null;
      }

      values.push(parsed);
      this.index = endIndex;
      if (!this.matchSymbol(symbol)) {
        break;
      }
    }

    return values;
  }

  private parseAssignment(): ExprNode {
    const left = this.parseConditional();
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
        ...this.rangeFromNode(left, value),
      };
      return node;
    }
    return left;
  }

  private parseConditional(): ExprNode {
    const condition = this.parseLogicalOr();
    if (!this.matchSymbol("?")) {
      return condition;
    }

    const thenExpr = this.parseAssignment();
    if (!this.consumeSymbol(":", "expected ':' in conditional expression")) {
      return condition;
    }
    const elseExpr = this.parseConditional();
    const node: ConditionalExprNode = {
      kind: "ConditionalExpr",
      condition,
      thenExpr,
      elseExpr,
      resolvedType: null,
      ...this.rangeFromNode(condition, elseExpr),
    };
    return node;
  }

  private parseLogicalOr(): ExprNode {
    return this.parseLeftAssociative(() => this.parseLogicalAnd(), ["||"]);
  }

  private parseLogicalAnd(): ExprNode {
    return this.parseLeftAssociative(() => this.parseBitwiseOr(), ["&&"]);
  }

  private parseBitwiseOr(): ExprNode {
    return this.parseLeftAssociative(() => this.parseBitwiseXor(), ["|"]);
  }

  private parseBitwiseXor(): ExprNode {
    return this.parseLeftAssociative(() => this.parseBitwiseAnd(), ["^"]);
  }

  private parseBitwiseAnd(): ExprNode {
    return this.parseLeftAssociative(() => this.parseEquality(), ["&"]);
  }

  private parseEquality(): ExprNode {
    return this.parseLeftAssociative(() => this.parseRelational(), ["==", "!="]);
  }

  private parseRelational(): ExprNode {
    return this.parseLeftAssociative(() => this.parseShift(), ["<", "<=", ">", ">="]);
  }

  private parseShift(): ExprNode {
    return this.parseLeftAssociative(() => this.parseAdditive(), ["<<", ">>"]);
  }

  private parseAdditive(): ExprNode {
    return this.parseLeftAssociative(() => this.parseMultiplicative(), ["+", "-"]);
  }

  private parseMultiplicative(): ExprNode {
    return this.parseLeftAssociative(() => this.parseUnary(), ["*", "/", "%"]);
  }

  private parseUnary(): ExprNode {
    if (this.matchAnySymbol(["!", "-", "~", "++", "--"])) {
      const op = this.previous();
      const operand = this.parseUnary();
      const node: UnaryExprNode = {
        kind: "UnaryExpr",
        operator: op.text as UnaryExprNode["operator"],
        operand,
        isPostfix: false,
        ...this.rangeFromNode(op, operand),
      };
      return node;
    }

    if (this.matchSymbol("&")) {
      const operator = this.previous();
      const operand = this.parseUnary();
      if (!isAssignTarget(operand)) {
        this.errorAt(operator, "address-of operand must be an lvalue");
        return operand;
      }
      const node: AddressOfExprNode = {
        kind: "AddressOfExpr",
        target: operand,
        ...this.rangeFromNode(operator, operand),
      };
      return node;
    }

    if (this.matchSymbol("*")) {
      const operator = this.previous();
      const pointer = this.parseUnary();
      const node: DerefExprNode = {
        kind: "DerefExpr",
        pointer,
        ...this.rangeFromNode(operator, pointer),
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
        ...this.rangeFrom(token, token),
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

        if (expr.kind !== "Identifier" && expr.kind !== "TemplateIdExpr") {
          this.errorAt(this.previous(), "invalid function call target");
          break;
        }

        expr =
          expr.kind === "Identifier"
            ? {
                kind: "CallExpr",
                callee: expr.name,
                args,
                ...this.rangeToPrevious(expr),
              }
            : {
                kind: "TemplateCallExpr",
                callee: expr,
                args,
                ...this.rangeToPrevious(expr),
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
          ...this.rangeToPrevious(expr),
        };
        continue;
      }

      if (this.matchSymbol(".")) {
        const methodToken = this.consumeIdentifier("expected method name after '.'");
        if (methodToken === null) {
          break;
        }
        const args: ExprNode[] = [];
        if (this.matchSymbol("(")) {
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
        }
        expr = {
          kind: "MethodCallExpr",
          receiver: expr,
          method: methodToken.text,
          args,
          ...this.rangeToPrevious(expr),
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
          ...this.rangeToPrevious(expr),
        };
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): ExprNode | null {
    const templateId = this.parseTemplateIdExpr();
    if (templateId !== null) {
      return templateId;
    }

    if (this.match("number")) {
      const t = this.previous();
      if (/[.eE]/.test(t.text)) {
        return {
          kind: "Literal",
          valueType: "double",
          value: Number(t.text),
          ...this.rangeFrom(t, t),
        };
      }
      return {
        kind: "Literal",
        valueType: "int",
        value: BigInt(t.text),
        ...this.rangeFrom(t, t),
      };
    }

    if (this.match("string")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "string",
        value: t.text,
        ...this.rangeFrom(t, t),
      };
    }

    if (this.match("char")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "char",
        value: t.text,
        ...this.rangeFrom(t, t),
      };
    }

    if (this.matchKeyword("true") || this.matchKeyword("false")) {
      const t = this.previous();
      return {
        kind: "Literal",
        valueType: "bool",
        value: t.text === "true",
        ...this.rangeFrom(t, t),
      };
    }

    if (this.matchKeyword("endl")) {
      const t = this.previous();
      return {
        kind: "Identifier",
        name: "endl",
        ...this.rangeFrom(t, t),
      };
    }

    if (this.match("identifier")) {
      const id = this.previous();
      return {
        kind: "Identifier",
        name: id.text,
        ...this.rangeFrom(id, id),
      };
    }

    if (this.matchSymbol("(")) {
      const expr = this.parseExpression();
      this.consumeSymbol(")", "expected ')' after expression");
      return expr;
    }

    return null;
  }

  private parseTemplateIdExpr(): TemplateIdExprNode | null {
    const startIndex = this.index;
    const startToken = this.tokens[startIndex];
    if (startToken === undefined) {
      return null;
    }
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    const comparator = token?.kind === "identifier" ? getBuiltinTemplateComparatorSpec(token.text) : null;
    if (
      !(
        token?.kind === "identifier" ||
        token?.kind === "keyword"
      ) ||
      (comparator === null &&
        token.text !== "get" &&
        !this.checkKeyword("vector") &&
        !this.checkKeyword("map") &&
        !this.checkKeyword("pair") &&
        !this.checkKeyword("tuple")) ||
      next?.kind !== "symbol" ||
      next.text !== "<"
    ) {
      return null;
    }

    this.advance();
    const templateName = token.text;
    if (!this.consumeSymbol("<", `expected '<' after ${templateName}`)) {
      return null;
    }
    const templateArgs = this.parseTemplateExprArguments(templateName);
    if (templateArgs === null) {
      return null;
    }
    if (!this.consumeTypeClose(`expected '>' after ${templateName}`)) {
      return null;
    }
    return {
      kind: "TemplateIdExpr",
      template: templateName,
      templateArgs,
      ...this.rangeToPrevious(token),
    };
  }

  private parseTemplateExprArguments(templateName: string): TemplateArgNode[] | null {
    const args: TemplateArgNode[] = [];
    if (
      templateName === "greater" &&
      this.checkSymbol(">")
    ) {
      return args;
    }
    while (true) {
      if (this.checkTypeStart()) {
        const typeArg = this.parseType();
        if (typeArg === null) {
          return null;
        }
        args.push({ kind: "TypeTemplateArg", type: typeArg });
      } else if (this.peek().kind === "number") {
        const numberToken = this.advance();
        if (/[.eE]/.test(numberToken.text)) {
          this.errorAt(numberToken, `${templateName} template argument must be an integer or type`);
          return null;
        }
        const value = Number(numberToken.text);
        if (!Number.isSafeInteger(value) || value < 0) {
          this.errorAt(numberToken, "template integer argument must be a non-negative integer");
          return null;
        }
        args.push({ kind: "IntTemplateArg", value });
      } else {
        this.errorAtCurrent(`expected template argument in ${templateName}`);
        return null;
      }

      this.splitShiftCloseToken();
      if (this.checkSymbol(">")) {
        break;
      }
      if (!this.consumeSymbol(",", `expected ',' in ${templateName} template argument list`)) {
        return null;
      }
    }
    return args;
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
        ...this.rangeFromNode(expr, right),
      };
    }
    return expr;
  }

  private findStreamOperandEnd(symbol: "<<" | ">>"): number {
    let depth = 0;
    let cursor = this.index;

    while (cursor < this.tokens.length) {
      const token = this.tokens[cursor];
      if (token === undefined || token.kind === "eof") {
        return cursor;
      }
      if (token.kind === "symbol") {
        if (token.text === "(" || token.text === "[") {
          depth += 1;
        } else if (token.text === ")" || token.text === "]") {
          depth = Math.max(0, depth - 1);
        } else if (depth === 0 && (token.text === symbol || token.text === ";")) {
          return cursor;
        }
      }
      cursor += 1;
    }

    return cursor;
  }
}

class StreamOperandParser extends ExpressionParser {
  parseOperand(): ExprNode | null {
    const expr = this.parseExpression();
    if (this.errors.length > 0) {
      return null;
    }
    if (!this.isAtEnd()) {
      this.errorAtCurrent("unexpected token in expression");
      return null;
    }
    return expr;
  }

  getErrors() {
    return this.errors;
  }
}
