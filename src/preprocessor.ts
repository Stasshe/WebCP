import type { CompileError } from "./types";

type ObjectMacro = {
  kind: "object";
  name: string;
  body: string;
};

type FunctionMacro = {
  kind: "function";
  name: string;
  params: string[];
  body: string;
};

type MacroDefinition = ObjectMacro | FunctionMacro;

type PreprocessResult = { ok: true; source: string } | { ok: false; errors: CompileError[] };

const INCLUDE_PATTERN = /^\s*#\s*include\s*<bits\/stdc\+\+\.h>\s*$/;
const DEFINE_PATTERN = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*(.*)$/;

export function preprocess(source: string): PreprocessResult {
  const macros = new Map<string, MacroDefinition>();
  const errors: CompileError[] = [];
  const lines = source.split("\n");
  const output: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNo = lineIndex + 1;
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trimStart();

    if (!trimmed.startsWith("#")) {
      output.push(expandLine(line, macros, lineNo, errors));
      continue;
    }

    if (INCLUDE_PATTERN.test(line)) {
      output.push("");
      continue;
    }

    const defineMatch = line.match(DEFINE_PATTERN);
    if (defineMatch !== null) {
      const name = defineMatch[1];
      if (name === undefined) {
        errors.push({ line: lineNo, col: 1, message: "invalid macro definition" });
        output.push("");
        continue;
      }

      const paramsGroup = defineMatch[3];
      const body = defineMatch[4] ?? "";
      if (paramsGroup === undefined) {
        macros.set(name, { kind: "object", name, body });
      } else {
        const params = paramsGroup
          .split(",")
          .map((param) => param.trim())
          .filter((param) => param.length > 0);
        macros.set(name, { kind: "function", name, params, body });
      }
      output.push("");
      continue;
    }

    errors.push({
      line: lineNo,
      col: 1,
      message: "unsupported preprocessor directive",
    });
    output.push("");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, source: output.join("\n") };
}

function expandLine(
  line: string,
  macros: Map<string, MacroDefinition>,
  lineNo: number,
  errors: CompileError[],
  depth = 0,
): string {
  if (depth > 20) {
    errors.push({ line: lineNo, col: 1, message: "macro expansion exceeded limit" });
    return line;
  }

  let result = "";
  let index = 0;

  while (index < line.length) {
    const ch = line[index] ?? "";

    if (ch === '"') {
      const { text, nextIndex } = readStringLiteral(line, index);
      result += text;
      index = nextIndex;
      continue;
    }

    if (ch === "/" && (line[index + 1] ?? "") === "/") {
      result += line.slice(index);
      break;
    }

    if (ch === "/" && (line[index + 1] ?? "") === "*") {
      const end = line.indexOf("*/", index + 2);
      if (end === -1) {
        result += line.slice(index);
        break;
      }
      result += line.slice(index, end + 2);
      index = end + 2;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let end = index + 1;
      while (end < line.length && isIdentifierPart(line[end] ?? "")) {
        end += 1;
      }
      const name = line.slice(index, end);
      const macro = macros.get(name);
      if (macro === undefined) {
        result += name;
        index = end;
        continue;
      }

      if (macro.kind === "object") {
        result += expandLine(macro.body, macros, lineNo, errors, depth + 1);
        index = end;
        continue;
      }

      const invocation = readFunctionMacroInvocation(line, end);
      if (invocation === null) {
        result += name;
        index = end;
        continue;
      }

      if (invocation.args.length !== macro.params.length) {
        errors.push({
          line: lineNo,
          col: index + 1,
          message: `macro '${macro.name}' expects ${macro.params.length} arguments`,
        });
        result += line.slice(index, invocation.nextIndex);
        index = invocation.nextIndex;
        continue;
      }

      let expandedBody = macro.body;
      for (let argIndex = 0; argIndex < macro.params.length; argIndex += 1) {
        const param = macro.params[argIndex];
        const arg = invocation.args[argIndex];
        if (param === undefined || arg === undefined) {
          continue;
        }
        expandedBody = replaceIdentifier(expandedBody, param, arg.trim());
      }
      result += expandLine(expandedBody, macros, lineNo, errors, depth + 1);
      index = invocation.nextIndex;
      continue;
    }

    result += ch;
    index += 1;
  }

  return result;
}

function readStringLiteral(line: string, start: number): { text: string; nextIndex: number } {
  let index = start + 1;
  while (index < line.length) {
    const ch = line[index] ?? "";
    if (ch === "\\") {
      index += 2;
      continue;
    }
    if (ch === '"') {
      index += 1;
      break;
    }
    index += 1;
  }
  return { text: line.slice(start, index), nextIndex: index };
}

function readFunctionMacroInvocation(
  line: string,
  start: number,
): { args: string[]; nextIndex: number } | null {
  let index = start;
  while (index < line.length && /\s/.test(line[index] ?? "")) {
    index += 1;
  }
  if ((line[index] ?? "") !== "(") {
    return null;
  }

  index += 1;
  const args: string[] = [];
  let depth = 0;
  let current = "";

  while (index < line.length) {
    const ch = line[index] ?? "";
    if (ch === '"') {
      const literal = readStringLiteral(line, index);
      current += literal.text;
      index = literal.nextIndex;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      current += ch;
      index += 1;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) {
        const trimmed = current.trim();
        if (trimmed.length > 0 || args.length > 0) {
          args.push(current);
        }
        return { args, nextIndex: index + 1 };
      }
      depth -= 1;
      current += ch;
      index += 1;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += ch;
    index += 1;
  }

  return null;
}

function replaceIdentifier(source: string, identifier: string, replacement: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const ch = source[index] ?? "";
    if (isIdentifierStart(ch)) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end] ?? "")) {
        end += 1;
      }
      const token = source.slice(index, end);
      result += token === identifier ? replacement : token;
      index = end;
      continue;
    }
    result += ch;
    index += 1;
  }

  return result;
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}
