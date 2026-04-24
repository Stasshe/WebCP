import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  PrimitiveTypeNode,
  ProgramNode,
  StatementNode,
  TypeNode,
} from "../types";
import { isPrimitiveType, typeToString } from "../types";

type ValidationContext = {
  errors: CompileError[];
  functions: Map<string, FunctionDeclNode>;
  scopes: Map<string, TypeNode>[];
  loopDepth: number;
  currentReturnType: TypeNode | null;
};

export function validateProgram(program: ProgramNode): CompileError[] {
  const { functions, errors } = collectFunctions(program);
  const context: ValidationContext = {
    errors,
    functions,
    scopes: [new Map()],
    loopDepth: 0,
    currentReturnType: null,
  };

  validateMainSignature(functions, context);

  for (const decl of program.globals) {
    validateDecl(decl, context);
  }

  for (const fn of program.functions) {
    validateFunction(fn, context);
  }

  return context.errors;
}

function collectFunctions(program: ProgramNode): {
  functions: Map<string, FunctionDeclNode>;
  errors: CompileError[];
} {
  const functions = new Map<string, FunctionDeclNode>();
  const errors: CompileError[] = [];

  for (const fn of program.functions) {
    if (functions.has(fn.name)) {
      errors.push({
        line: fn.line,
        col: fn.col,
        message: `redefinition of function '${fn.name}'`,
      });
      continue;
    }
    functions.set(fn.name, fn);
  }

  return { functions, errors };
}

function validateMainSignature(functions: Map<string, FunctionDeclNode>, context: ValidationContext): void {
  const main = functions.get("main");
  if (main === undefined) {
    return;
  }
  if (!isPrimitiveType(main.returnType) || main.returnType.name !== "int") {
    pushError(context, main.line, main.col, "'main' must return 'int'");
  }
  if (main.params.length !== 0) {
    pushError(context, main.line, main.col, "'main' must not take any arguments");
  }
}

function validateFunction(fn: FunctionDeclNode, context: ValidationContext): void {
  validateFunctionReturnType(fn, context);
  pushScope(context);
  const previousReturnType = context.currentReturnType;
  context.currentReturnType = fn.returnType;

  for (const param of fn.params) {
    validateParameterType(param.type, param.line, param.col, context);
    defineSymbol(param.name, param.type, param.line, param.col, context);
  }

  validateBlock(fn.body.statements, context);

  context.currentReturnType = previousReturnType;
  popScope(context);
}

function validateParameterType(
  type: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): void {
  if (type.kind === "PrimitiveType") {
    if (type.name === "void") {
      pushError(context, line, col, "parameter type cannot be void");
    }
    return;
  }

  if (type.elementType.name === "void") {
    pushError(
      context,
      line,
      col,
      `${type.kind === "ArrayType" ? "array" : "vector"} parameter element type cannot be void`,
    );
  }
}

function validateFunctionReturnType(fn: FunctionDeclNode, context: ValidationContext): void {
  if (!isPrimitiveType(fn.returnType)) {
    pushError(
      context,
      fn.line,
      fn.col,
      `function return type must be primitive, got '${typeToString(fn.returnType)}'`,
    );
    return;
  }
}

function validateBlock(statements: StatementNode[], context: ValidationContext): void {
  pushScope(context);
  for (const stmt of statements) {
    validateStatement(stmt, context);
  }
  popScope(context);
}

function validateStatement(stmt: StatementNode, context: ValidationContext): void {
  switch (stmt.kind) {
    case "BlockStmt":
      validateBlock(stmt.statements, context);
      return;
    case "VarDecl":
    case "ArrayDecl":
    case "VectorDecl":
      validateDecl(stmt, context);
      return;
    case "IfStmt":
      for (const branch of stmt.branches) {
        validateExpr(branch.condition, context, "bool");
        validateBlock(branch.thenBlock.statements, context);
      }
      if (stmt.elseBlock !== null) {
        validateBlock(stmt.elseBlock.statements, context);
      }
      return;
    case "WhileStmt":
      validateExpr(stmt.condition, context, "bool");
      validateLoopBody(stmt.body.statements, context);
      return;
    case "ForStmt":
      pushScope(context);
      if (stmt.init.kind === "varDecl") {
        validateDecl(stmt.init.value, context);
      } else if (stmt.init.kind === "expr") {
        validateExpr(stmt.init.value, context);
      }
      if (stmt.condition !== null) {
        validateExpr(stmt.condition, context, "bool");
      }
      if (stmt.update !== null) {
        validateExpr(stmt.update, context);
      }
      validateLoopBody(stmt.body.statements, context);
      popScope(context);
      return;
    case "ReturnStmt":
      validateReturn(stmt, context);
      return;
    case "BreakStmt":
      if (context.loopDepth === 0) {
        pushError(context, stmt.line, stmt.col, "break statement not within a loop");
      }
      return;
    case "ContinueStmt":
      if (context.loopDepth === 0) {
        pushError(context, stmt.line, stmt.col, "continue statement not within a loop");
      }
      return;
    case "ExprStmt":
      validateExpr(stmt.expression, context);
      return;
    case "CoutStmt":
    case "CerrStmt":
      for (const value of stmt.values) {
        validateExpr(value, context);
      }
      return;
    case "CinStmt":
      for (const target of stmt.targets) {
        const type = validateExpr(target, context);
        if (type === null || !isInputTargetType(type)) {
          pushError(context, target.line, target.col, "invalid cin target");
        }
      }
      return;
  }
}

function validateDecl(
  stmt: Extract<StatementNode, { kind: "VarDecl" | "ArrayDecl" | "VectorDecl" }> | ProgramNode["globals"][number],
  context: ValidationContext,
): void {
  switch (stmt.kind) {
    case "VarDecl":
      if (!isPrimitiveType(stmt.type)) {
        pushError(
          context,
          stmt.line,
          stmt.col,
          `variable type must be primitive, got '${typeToString(stmt.type)}'`,
        );
      } else if (stmt.type.name === "void") {
        pushError(context, stmt.line, stmt.col, "variable type cannot be void");
      }
      if (stmt.initializer !== null) {
        validateExpr(stmt.initializer, context, stmt.type);
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "ArrayDecl":
      if (stmt.type.elementType.name === "void") {
        pushError(context, stmt.line, stmt.col, "array element type cannot be void");
      }
      for (const init of stmt.initializers) {
        validateExpr(init, context, stmt.type.elementType);
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "VectorDecl":
      if (stmt.type.elementType.name === "void") {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be void");
      }
      if (stmt.constructorArgs.length >= 1) {
        validateExpr(stmt.constructorArgs[0] ?? null, context, "int");
      }
      if (stmt.constructorArgs.length >= 2) {
        validateExpr(stmt.constructorArgs[1] ?? null, context, stmt.type.elementType);
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
  }
}

function validateReturn(
  stmt: Extract<StatementNode, { kind: "ReturnStmt" }>,
  context: ValidationContext,
): void {
  const returnType = context.currentReturnType;
  if (returnType === null) {
    return;
  }

  if (isPrimitiveType(returnType) && returnType.name === "void") {
    if (stmt.value !== null) {
      pushError(
        context,
        stmt.line,
        stmt.col,
        "return-statement with a value, in function returning 'void'",
      );
    }
    return;
  }

  if (stmt.value === null) {
    pushError(context, stmt.line, stmt.col, "return-statement with no value, in function returning non-void");
    return;
  }

  validateExpr(stmt.value, context, returnType);
}

function validateExpr(
  expr: ExprNode | null,
  context: ValidationContext,
  expected?: TypeNode | "bool" | "int",
): TypeNode | null {
  if (expr === null) {
    return null;
  }

  const type = inferExprType(expr, context);
  if (type !== null && expected !== undefined) {
    const expectedType = normalizeExpectedType(expected);
    if (!isAssignable(type, expectedType)) {
      pushError(
        context,
        expr.line,
        expr.col,
        `cannot convert '${typeToString(type)}' to '${typeToString(expectedType)}'`,
      );
    }
  }
  return type;
}

function inferExprType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  switch (expr.kind) {
    case "Literal":
      if (expr.valueType === "int") {
        return { kind: "PrimitiveType", name: "int" };
      }
      if (expr.valueType === "bool") {
        return { kind: "PrimitiveType", name: "bool" };
      }
      return { kind: "PrimitiveType", name: "string" };
    case "Identifier":
      if (expr.name === "endl") {
        return { kind: "PrimitiveType", name: "string" };
      }
      return resolveSymbol(expr.name, expr.line, expr.col, context);
    case "IndexExpr": {
      const targetType = inferExprType(expr.target, context);
      validateExpr(expr.index, context, "int");
      if (targetType === null) {
        return null;
      }
      if (targetType.kind === "ArrayType" || targetType.kind === "VectorType") {
        return targetType.elementType;
      }
      pushError(context, expr.line, expr.col, "type mismatch: expected array/vector");
      return null;
    }
    case "AssignExpr": {
      const targetType = inferExprType(expr.target, context);
      const valueType = validateExpr(expr.value, context, targetType ?? undefined);
      if (expr.operator !== "=" && targetType !== null && !isIntType(targetType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected int");
      }
      if (expr.operator !== "=" && valueType !== null && !isIntType(valueType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected int");
      }
      return targetType;
    }
    case "UnaryExpr": {
      const operandType = inferExprType(expr.operand, context);
      if (expr.operator === "!") {
        if (operandType !== null && !isBoolType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected bool");
        }
        return { kind: "PrimitiveType", name: "bool" };
      }
      if (expr.operator === "-") {
        if (operandType !== null && !isIntType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected int");
        }
        return { kind: "PrimitiveType", name: "int" };
      }
      if (!isAssignableExpr(expr.operand)) {
        pushError(context, expr.line, expr.col, "increment/decrement target must be a variable");
      }
      if (operandType !== null && !isIntType(operandType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected int");
      }
      return { kind: "PrimitiveType", name: "int" };
    }
    case "BinaryExpr": {
      const left = inferExprType(expr.left, context);
      const right = inferExprType(expr.right, context);
      return inferBinaryType(expr, left, right, context);
    }
    case "CallExpr":
      return validateCall(expr.callee, expr.args, expr.line, expr.col, context);
    case "MethodCallExpr":
      return validateMethodCall(expr.receiver, expr.method, expr.args, expr.line, expr.col, context);
  }
}

function inferBinaryType(
  expr: Extract<ExprNode, { kind: "BinaryExpr" }>,
  left: TypeNode | null,
  right: TypeNode | null,
  context: ValidationContext,
): TypeNode | null {
  if (expr.operator === "&&" || expr.operator === "||") {
    if (left !== null && !isBoolType(left)) {
      pushError(context, expr.left.line, expr.left.col, "type mismatch: expected bool");
    }
    if (right !== null && !isBoolType(right)) {
      pushError(context, expr.right.line, expr.right.col, "type mismatch: expected bool");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "==" ||
    expr.operator === "!=" ||
    expr.operator === "<" ||
    expr.operator === "<=" ||
    expr.operator === ">" ||
    expr.operator === ">="
  ) {
    if (left !== null && right !== null && !sameType(left, right)) {
      pushError(context, expr.line, expr.col, "type mismatch in comparison");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (expr.operator === "+" && left !== null && right !== null && isStringType(left) && isStringType(right)) {
    return { kind: "PrimitiveType", name: "string" };
  }

  if (left !== null && !isIntType(left)) {
    pushError(context, expr.left.line, expr.left.col, "type mismatch: expected int");
  }
  if (right !== null && !isIntType(right)) {
    pushError(context, expr.right.line, expr.right.col, "type mismatch: expected int");
  }
  return { kind: "PrimitiveType", name: "int" };
}

function validateCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  const fn = context.functions.get(callee);
  if (fn !== undefined) {
    if (args.length < fn.params.length) {
      pushError(context, line, col, `too few arguments to function '${callee}'`);
    } else if (args.length > fn.params.length) {
      pushError(context, line, col, `too many arguments to function '${callee}'`);
    }

    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      const param = fn.params[i];
      if (arg === undefined) {
        continue;
      }
      validateExpr(arg, context, param?.type);
    }

    return fn.returnType;
  }

  const builtin = validateBuiltinCall(callee, args, line, col, context);
  if (builtin !== undefined) {
    return builtin;
  }

  pushError(context, line, col, `'${callee}' was not declared in this scope`);
  args.forEach((arg) => validateExpr(arg, context));
  return null;
}

function validateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null | undefined {
  if (callee === "abs") {
    if (args.length !== 1) {
      pushError(context, line, col, "abs requires exactly 1 argument");
    }
    validateExpr(args[0] ?? null, context, "int");
    return { kind: "PrimitiveType", name: "int" };
  }

  if (callee === "max" || callee === "min") {
    if (args.length !== 2) {
      pushError(context, line, col, `${callee} requires exactly 2 arguments`);
    }
    validateExpr(args[0] ?? null, context, "int");
    validateExpr(args[1] ?? null, context, "int");
    return { kind: "PrimitiveType", name: "int" };
  }

  if (callee === "swap") {
    if (args.length !== 2) {
      pushError(context, line, col, "swap requires exactly 2 arguments");
    }
    const left = args[0];
    const right = args[1];
    if (left !== undefined) {
      const leftType = validateExpr(left, context);
      if (!isAssignableExpr(left)) {
        pushError(context, left.line, left.col, "swap arguments must be lvalues");
      }
      if (right !== undefined) {
        const rightType = validateExpr(right, context, leftType ?? undefined);
        if (!isAssignableExpr(right)) {
          pushError(context, right.line, right.col, "swap arguments must be lvalues");
        }
        if (leftType !== null && rightType !== null && !isAssignable(rightType, leftType)) {
          pushError(context, line, col, `cannot convert '${typeToString(rightType)}' to '${typeToString(leftType)}'`);
        }
      }
    } else if (right !== undefined) {
      validateExpr(right, context);
    }
    return { kind: "PrimitiveType", name: "void" };
  }

  if (callee === "sort" || callee === "reverse" || callee === "fill") {
    return validateRangeBuiltin(callee, args, line, col, context);
  }

  if (callee === "greater") {
    pushError(context, line, col, "'greater' was not declared in this scope");
    return null;
  }

  return undefined;
}

function validateRangeBuiltin(
  callee: "sort" | "reverse" | "fill",
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  const expectedArgs = callee === "sort" ? "2 or 3" : callee === "fill" ? "exactly 3" : "exactly 2";
  const minArgs = callee === "fill" ? 3 : 2;
  const maxArgs = callee === "sort" ? 3 : callee === "fill" ? 3 : 2;
  if (args.length < minArgs || args.length > maxArgs) {
    pushError(context, line, col, `${callee} requires ${expectedArgs} arguments`);
  }

  const rangeType = validateVectorRangeArgs(args[0], args[1], callee, context, line, col);

  if (callee === "fill") {
    validateExpr(args[2] ?? null, context, rangeType?.elementType);
  } else if (callee === "sort" && args[2] !== undefined) {
    const comparator = args[2];
    if (!(comparator.kind === "CallExpr" && comparator.callee === "greater" && comparator.args.length === 0)) {
      pushError(context, comparator.line, comparator.col, "unsupported sort comparator");
    }
  }

  return { kind: "PrimitiveType", name: "void" };
}

function validateVectorRangeArgs(
  beginExpr: ExprNode | undefined,
  endExpr: ExprNode | undefined,
  callee: string,
  context: ValidationContext,
  line: number,
  col: number,
): Extract<TypeNode, { kind: "VectorType" }> | null {
  if (
    beginExpr === undefined ||
    endExpr === undefined ||
    beginExpr.kind !== "MethodCallExpr" ||
    endExpr.kind !== "MethodCallExpr" ||
    beginExpr.method !== "begin" ||
    endExpr.method !== "end" ||
    beginExpr.args.length !== 0 ||
    endExpr.args.length !== 0
  ) {
    pushError(context, line, col, `${callee} requires vector begin/end iterators`);
    if (beginExpr !== undefined) {
      validateExpr(beginExpr, context);
    }
    if (endExpr !== undefined) {
      validateExpr(endExpr, context);
    }
    return null;
  }

  if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
    pushError(context, line, col, `${callee} requires iterators from the same vector`);
  }

  const receiverType = inferExprType(beginExpr.receiver, context);
  if (receiverType === null) {
    return null;
  }
  if (receiverType.kind !== "VectorType") {
    pushError(context, line, col, `${callee} requires a vector range`);
    return null;
  }
  return receiverType;
}

function validateMethodCall(
  receiver: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  const receiverType = inferExprType(receiver, context);
  if (receiverType === null) {
    args.forEach((arg) => validateExpr(arg, context));
    return null;
  }
  if (receiverType.kind !== "VectorType") {
    pushError(context, line, col, "type mismatch: expected array/vector");
    args.forEach((arg) => validateExpr(arg, context));
    return null;
  }

  switch (method) {
    case "begin":
    case "end":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return receiverType;
    case "push_back":
      if (args.length !== 1) {
        pushError(context, line, col, "push_back requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, receiverType.elementType);
      return { kind: "PrimitiveType", name: "void" };
    case "pop_back":
    case "clear":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return { kind: "PrimitiveType", name: "void" };
    case "size":
      if (args.length !== 0) {
        pushError(context, line, col, "size requires no arguments");
      }
      return { kind: "PrimitiveType", name: "int" };
    case "back":
      if (args.length !== 0) {
        pushError(context, line, col, "back requires no arguments");
      }
      return receiverType.elementType;
    case "empty":
      if (args.length !== 0) {
        pushError(context, line, col, "empty requires no arguments");
      }
      return { kind: "PrimitiveType", name: "bool" };
    case "resize":
      if (args.length !== 1) {
        pushError(context, line, col, "resize requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, "int");
      return { kind: "PrimitiveType", name: "void" };
    default:
      pushError(context, line, col, `unknown vector method '${method}'`);
      args.forEach((arg) => validateExpr(arg, context));
      return null;
  }
}

function resolveSymbol(
  name: string,
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  for (let i = context.scopes.length - 1; i >= 0; i -= 1) {
    const scope = context.scopes[i];
    if (scope?.has(name)) {
      return scope.get(name) ?? null;
    }
  }
  pushError(context, line, col, `'${name}' was not declared in this scope`);
  return null;
}

function defineSymbol(
  name: string,
  type: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): void {
  const scope = context.scopes[context.scopes.length - 1];
  if (scope === undefined) {
    return;
  }
  if (scope.has(name)) {
    pushError(context, line, col, `redefinition of '${name}'`);
    return;
  }
  scope.set(name, type);
}

function pushScope(context: ValidationContext): void {
  context.scopes.push(new Map());
}

function popScope(context: ValidationContext): void {
  context.scopes.pop();
}

function validateLoopBody(statements: StatementNode[], context: ValidationContext): void {
  context.loopDepth += 1;
  validateBlock(statements, context);
  context.loopDepth -= 1;
}

function normalizeExpectedType(expected: TypeNode | "bool" | "int"): TypeNode {
  if (expected === "bool") {
    return { kind: "PrimitiveType", name: "bool" };
  }
  if (expected === "int") {
    return { kind: "PrimitiveType", name: "int" };
  }
  return expected;
}

function sameType(left: TypeNode, right: TypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "PrimitiveType":
      return left.name === (right as PrimitiveTypeNode).name;
    case "ArrayType":
      return left.elementType.name === (right as Extract<TypeNode, { kind: "ArrayType" }>).elementType.name;
    case "VectorType":
      return (
        left.elementType.name ===
        (right as Extract<TypeNode, { kind: "VectorType" }>).elementType.name
      );
  }
}

function isAssignable(source: TypeNode, target: TypeNode): boolean {
  if (sameType(source, target)) {
    return true;
  }
  return (
    isPrimitiveType(source) &&
    isPrimitiveType(target) &&
    ((source.name === "int" && target.name === "long long") ||
      (source.name === "long long" && target.name === "int"))
  );
}

function isAssignableExpr(expr: ExprNode): boolean {
  return expr.kind === "Identifier" || expr.kind === "IndexExpr";
}

function isIntType(type: TypeNode): boolean {
  return isPrimitiveType(type) && (type.name === "int" || type.name === "long long");
}

function isBoolType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "bool";
}

function isStringType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "string";
}

function isInputTargetType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name !== "void";
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
