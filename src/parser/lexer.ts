import type { CompileError, Token } from "../types";

const KEYWORDS = new Set<string>([
  "int",
  "long",
  "bool",
  "string",
  "void",
  "if",
  "else",
  "for",
  "while",
  "return",
  "break",
  "continue",
  "true",
  "false",
  "cin",
  "cout",
  "cerr",
]);

const TWO_CHAR_SYMBOLS = new Set<string>([
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "<<",
  ">>",
]);

const ONE_CHAR_SYMBOLS = new Set<string>([
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ",",
  ".",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "=",
  "!",
]);

export type LexResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; errors: CompileError[] };

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const errors: CompileError[] = [];

  let index = 0;
  let line = 1;
  let col = 1;

  const peek = (offset = 0): string => source[index + offset] ?? "";

  const advance = (): string => {
    const ch = source[index] ?? "";
    index += 1;
    if (ch === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
    return ch;
  };

  const addToken = (kind: Token["kind"], text: string, tokenLine: number, tokenCol: number): void => {
    tokens.push({ kind, text, line: tokenLine, col: tokenCol });
  };

  while (index < source.length) {
    const ch = peek();

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    if (ch === "/" && peek(1) === "/") {
      while (index < source.length && peek() !== "\n") {
        advance();
      }
      continue;
    }

    if (ch === "/" && peek(1) === "*") {
      const startLine = line;
      const startCol = col;
      advance();
      advance();
      let closed = false;
      while (index < source.length) {
        if (peek() === "*" && peek(1) === "/") {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        errors.push({
          line: startLine,
          col: startCol,
          message: "unterminated block comment",
        });
      }
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const tokenLine = line;
      const tokenCol = col;
      let text = "";
      while (/[A-Za-z0-9_]/.test(peek())) {
        text += advance();
      }
      addToken(KEYWORDS.has(text) ? "keyword" : "identifier", text, tokenLine, tokenCol);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const tokenLine = line;
      const tokenCol = col;
      let text = "";
      while (/[0-9]/.test(peek())) {
        text += advance();
      }
      addToken("number", text, tokenLine, tokenCol);
      continue;
    }

    if (ch === '"') {
      const tokenLine = line;
      const tokenCol = col;
      advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        const c = advance();
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === "\\") {
          const esc = advance();
          if (esc === "n") {
            value += "\n";
          } else if (esc === "t") {
            value += "\t";
          } else if (esc === '"') {
            value += '"';
          } else if (esc === "\\") {
            value += "\\";
          } else {
            value += esc;
          }
        } else {
          value += c;
        }
      }
      if (!closed) {
        errors.push({
          line: tokenLine,
          col: tokenCol,
          message: "unterminated string literal",
        });
      } else {
        addToken("string", value, tokenLine, tokenCol);
      }
      continue;
    }

    const two = `${ch}${peek(1)}`;
    if (TWO_CHAR_SYMBOLS.has(two)) {
      const tokenLine = line;
      const tokenCol = col;
      advance();
      advance();
      addToken("symbol", two, tokenLine, tokenCol);
      continue;
    }

    if (ONE_CHAR_SYMBOLS.has(ch)) {
      const tokenLine = line;
      const tokenCol = col;
      advance();
      addToken("symbol", ch, tokenLine, tokenCol);
      continue;
    }

    errors.push({ line, col, message: `unexpected character '${ch}'` });
    advance();
  }

  tokens.push({ kind: "eof", text: "<eof>", line, col });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, tokens };
}
