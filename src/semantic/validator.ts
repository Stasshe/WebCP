import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  PrimitiveTypeNode,
  ProgramNode,
  RangeForStmtNode,
  StatementNode,
  TypeNode,
} from "../types";
import { isPointerType, isPrimitiveType, isReferenceType, typeToString } from "../types";

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

function validateMainSignature(
  functions: Map<string, FunctionDeclNode>,
  context: ValidationContext,
): void {
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
  if (containsVoid(type)) {
    pushError(context, line, col, "parameter type cannot be void");
    return;
  }
  if (containsReferenceBelowTopLevel(type)) {
    pushError(context, line, col, "array/vector element type cannot be reference");
  }
}

function validateFunctionReturnType(fn: FunctionDeclNode, context: ValidationContext): void {
  if (fn.returnType.kind === "ArrayType" || fn.returnType.kind === "ReferenceType") {
    pushError(
      context,
      fn.line,
      fn.col,
      `function return type cannot be ${fn.returnType.kind === "ArrayType" ? "array" : "reference"}`,
    );
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
    case "DeclGroupStmt":
      for (const decl of stmt.declarations) {
        validateDecl(decl, context);
      }
      return;
    case "VarDecl":
    case "ArrayDecl":
    case "VectorDecl":
      validateDecl(stmt, context);
      return;
    case "RangeForStmt":
      validateRangeFor(stmt, context);
      return;
    case "IfStmt":
      for (const branch of stmt.branches) {
        validateConditionExpr(branch.condition, context);
        validateBlock(branch.thenBlock.statements, context);
      }
      if (stmt.elseBlock !== null) {
        validateBlock(stmt.elseBlock.statements, context);
      }
      return;
    case "WhileStmt":
      validateConditionExpr(stmt.condition, context);
      validateLoopBody(stmt.body.statements, context);
      return;
    case "ForStmt":
      pushScope(context);
      if (stmt.init.kind === "varDecl") {
        validateDecl(stmt.init.value, context);
      } else if (stmt.init.kind === "declGroup") {
        for (const decl of stmt.init.value) {
          validateDecl(decl, context);
        }
      } else if (stmt.init.kind === "expr") {
        validateExpr(stmt.init.value, context);
      }
      if (stmt.condition !== null) {
        validateConditionExpr(stmt.condition, context);
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
  stmt:
    | Extract<StatementNode, { kind: "VarDecl" | "ArrayDecl" | "VectorDecl" }>
    | ProgramNode["globals"][number],
  context: ValidationContext,
): void {
  switch (stmt.kind) {
    case "VarDecl":
      if (stmt.type.kind === "ArrayType" || stmt.type.kind === "VectorType") {
        pushError(
          context,
          stmt.line,
          stmt.col,
          `variable type cannot be '${typeToString(stmt.type)}'`,
        );
      } else if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "variable type cannot be void");
      }
      if (isReferenceType(stmt.type)) {
        if (stmt.initializer === null) {
          pushError(context, stmt.line, stmt.col, "reference variable must be initialized");
        } else {
          validateReferenceBinding(stmt.initializer, stmt.type.referredType, context);
        }
      } else if (stmt.initializer !== null) {
        validateExpr(stmt.initializer, context, stmt.type);
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "ArrayDecl":
      if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "array element type cannot be void");
      }
      if (containsReferenceBelowTopLevel(stmt.type.elementType)) {
        pushError(context, stmt.line, stmt.col, "array element type cannot be reference");
      }
      for (const init of stmt.initializers) {
        validateExpr(init, context, baseElementType(stmt.type));
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "VectorDecl":
      if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be void");
      }
      if (containsReferenceBelowTopLevel(stmt.type.elementType)) {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be reference");
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

function validateRangeFor(stmt: RangeForStmtNode, context: ValidationContext): void {
  const sourceType = validateExpr(stmt.source, context);
  const elementType =
    sourceType === null
      ? null
      : getIterableElementType(sourceType, stmt.source.line, stmt.source.col, context);
  const itemType = stmt.itemType ?? elementType;

  if (itemType === null) {
    pushScope(context);
    validateBlock(stmt.body.statements, context);
    popScope(context);
    return;
  }

  if (!isAssignable(elementType ?? itemType, itemType)) {
    pushError(
      context,
      stmt.line,
      stmt.col,
      `cannot convert '${typeToString(elementType ?? itemType)}' to '${typeToString(itemType)}'`,
    );
  }

  pushScope(context);
  defineSymbol(
    stmt.itemName,
    stmt.itemByReference ? { kind: "ReferenceType", referredType: itemType } : itemType,
    stmt.line,
    stmt.col,
    context,
  );
  validateBlock(stmt.body.statements, context);
  popScope(context);
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
    pushError(
      context,
      stmt.line,
      stmt.col,
      "return-statement with no value, in function returning non-void",
    );
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
    if (expectedType.kind === "PointerType" && isNullPointerConstantExpr(expr)) {
      return type;
    }
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

function validateConditionExpr(expr: ExprNode, context: ValidationContext): void {
  const type = validateExpr(expr, context);
  if (type !== null && !isBoolType(type) && !isNumericType(type)) {
    pushError(context, expr.line, expr.col, `cannot convert '${typeToString(type)}' to 'bool'`);
  }
}

function inferExprType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  switch (expr.kind) {
    case "Literal":
      if (expr.valueType === "int") {
        return { kind: "PrimitiveType", name: "int" };
      }
      if (expr.valueType === "double") {
        return { kind: "PrimitiveType", name: "double" };
      }
      if (expr.valueType === "bool") {
        return { kind: "PrimitiveType", name: "bool" };
      }
      return { kind: "PrimitiveType", name: "string" };
    case "Identifier":
      if (expr.name === "endl") {
        return { kind: "PrimitiveType", name: "string" };
      }
      return unwrapReference(resolveSymbol(expr.name, expr.line, expr.col, context));
    case "IndexExpr": {
      const targetType = inferExprType(expr.target, context);
      validateExpr(expr.index, context, "int");
      if (targetType === null) {
        return null;
      }
      if (isStringType(targetType)) {
        return { kind: "PrimitiveType", name: "string" };
      }
      if (targetType.kind === "ArrayType" || targetType.kind === "VectorType") {
        return targetType.elementType;
      }
      pushError(context, expr.line, expr.col, "type mismatch: expected array/vector/string");
      return null;
    }
    case "AddressOfExpr": {
      const targetType = inferLValueType(expr.target, context);
      return targetType === null ? null : { kind: "PointerType", pointeeType: targetType };
    }
    case "DerefExpr": {
      const pointerType = inferExprType(expr.pointer, context);
      if (pointerType === null) {
        return null;
      }
      if (pointerType.kind !== "PointerType") {
        pushError(context, expr.line, expr.col, "type mismatch: expected pointer");
        return null;
      }
      return pointerType.pointeeType;
    }
    case "AssignExpr": {
      const targetType = inferLValueType(expr.target, context);
      let valueType: TypeNode | null;
      if (expr.operator === "=") {
        valueType = validateExpr(expr.value, context, targetType ?? undefined);
      } else if (targetType !== null && isPointerType(targetType)) {
        valueType = validateExpr(expr.value, context, "int");
      } else {
        valueType = validateExpr(expr.value, context);
      }
      if (expr.operator !== "=") {
        if (targetType !== null && isPointerType(targetType)) {
          if (expr.operator !== "+=" && expr.operator !== "-=") {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
          if (valueType !== null && !isIntType(valueType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected int");
          }
        } else {
          if (targetType !== null && !isNumericType(targetType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
          if (valueType !== null && !isNumericType(valueType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
        }
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
        if (operandType !== null && !isNumericType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
        }
        return operandType !== null && isDoubleType(operandType)
          ? { kind: "PrimitiveType", name: "double" }
          : { kind: "PrimitiveType", name: "int" };
      }
      if (expr.operator === "~") {
        if (operandType !== null && !isIntType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected int");
        }
        return { kind: "PrimitiveType", name: "int" };
      }
      if (!isAssignableExpr(expr.operand)) {
        pushError(context, expr.line, expr.col, "increment/decrement target must be a variable");
      }
      if (operandType !== null && !isIntType(operandType) && !isPointerType(operandType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected int or pointer");
      }
      return operandType !== null && isPointerType(operandType)
        ? operandType
        : { kind: "PrimitiveType", name: "int" };
    }
    case "BinaryExpr": {
      const left = inferExprType(expr.left, context);
      const right = inferExprType(expr.right, context);
      return inferBinaryType(expr, left, right, context);
    }
    case "CallExpr":
      return validateCall(expr.callee, expr.args, expr.line, expr.col, context);
    case "MethodCallExpr":
      return validateMethodCall(
        expr.receiver,
        expr.method,
        expr.args,
        expr.line,
        expr.col,
        context,
      );
  }
}

function inferBinaryType(
  expr: Extract<ExprNode, { kind: "BinaryExpr" }>,
  left: TypeNode | null,
  right: TypeNode | null,
  context: ValidationContext,
): TypeNode | null {
  if (expr.operator === "+") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isIntType(left) && isPointerType(right)) {
      return right;
    }
  }

  if (expr.operator === "-") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isPointerType(left) && isPointerType(right)) {
      if (!sameType(left, right)) {
        pushError(context, expr.line, expr.col, "type mismatch in pointer subtraction");
      }
      return { kind: "PrimitiveType", name: "int" };
    }
  }

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
    if ((left !== null && isPointerType(left)) || (right !== null && isPointerType(right))) {
      if (expr.operator !== "==" && expr.operator !== "!=") {
        pushError(context, expr.line, expr.col, "pointer comparison only supports == and !=");
      }
      if (
        left !== null &&
        right !== null &&
        !sameType(left, right) &&
        !(isPointerType(left) && isNullPointerType(right)) &&
        !(isPointerType(right) && isNullPointerType(left))
      ) {
        pushError(context, expr.line, expr.col, "type mismatch in comparison");
      }
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      left !== null &&
      right !== null &&
      !sameType(left, right) &&
      !(isNumericType(left) && isNumericType(right))
    ) {
      pushError(context, expr.line, expr.col, "type mismatch in comparison");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "+" &&
    left !== null &&
    right !== null &&
    isStringType(left) &&
    isStringType(right)
  ) {
    return { kind: "PrimitiveType", name: "string" };
  }

  if (
    expr.operator === "<<" ||
    expr.operator === ">>" ||
    expr.operator === "&" ||
    expr.operator === "^" ||
    expr.operator === "|"
  ) {
    if (left !== null && !isIntType(left)) {
      pushError(context, expr.left.line, expr.left.col, "type mismatch: expected int");
    }
    if (right !== null && !isIntType(right)) {
      pushError(context, expr.right.line, expr.right.col, "type mismatch: expected int");
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (left !== null && !isNumericType(left)) {
    pushError(context, expr.left.line, expr.left.col, "type mismatch: expected numeric");
  }
  if (right !== null && !isNumericType(right)) {
    pushError(context, expr.right.line, expr.right.col, "type mismatch: expected numeric");
  }
  if (left !== null && isDoubleType(left)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  if (right !== null && isDoubleType(right)) {
    return { kind: "PrimitiveType", name: "double" };
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
      validateArgumentAgainstParam(arg, param?.type, context);
    }

    return fn.returnType;
  }

  const builtin = validateBuiltinCall(callee, args, line, col, context);
  if (builtin !== undefined) {
    return builtin;
  }

  pushError(context, line, col, `'${callee}' was not declared in this scope`);
  for (const arg of args) {
    validateExpr(arg, context);
  }
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
          pushError(
            context,
            line,
            col,
            `cannot convert '${typeToString(rightType)}' to '${typeToString(leftType)}'`,
          );
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
    if (
      !(
        comparator.kind === "CallExpr" &&
        comparator.callee === "greater" &&
        comparator.args.length === 0
      )
    ) {
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
    for (const arg of args) {
      validateExpr(arg, context);
    }
    return null;
  }
  if (receiverType.kind !== "VectorType") {
    pushError(context, line, col, "type mismatch: expected array/vector");
    for (const arg of args) {
      validateExpr(arg, context);
    }
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
      for (const arg of args) {
        validateExpr(arg, context);
      }
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
      return sameType(
        left.elementType,
        (right as Extract<TypeNode, { kind: "ArrayType" }>).elementType,
      );
    case "VectorType":
      return sameType(
        left.elementType,
        (right as Extract<TypeNode, { kind: "VectorType" }>).elementType,
      );
    case "PointerType":
      return sameType(
        left.pointeeType,
        (right as Extract<TypeNode, { kind: "PointerType" }>).pointeeType,
      );
    case "ReferenceType":
      return sameType(
        left.referredType,
        (right as Extract<TypeNode, { kind: "ReferenceType" }>).referredType,
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
      (source.name === "long long" && target.name === "int") ||
      ((source.name === "int" || source.name === "long long") && target.name === "double") ||
      (source.name === "double" && (target.name === "int" || target.name === "long long")))
  );
}

function isAssignableExpr(expr: ExprNode): boolean {
  return expr.kind === "Identifier" || expr.kind === "IndexExpr" || expr.kind === "DerefExpr";
}

function isIntType(type: TypeNode): boolean {
  return isPrimitiveType(type) && (type.name === "int" || type.name === "long long");
}

function isDoubleType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "double";
}

function isNumericType(type: TypeNode): boolean {
  return isIntType(type) || isDoubleType(type);
}

function isBoolType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "bool";
}

function isStringType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "string";
}

function isNullPointerConstantExpr(expr: ExprNode): boolean {
  return expr.kind === "Literal" && expr.valueType === "int" && expr.value === 0n;
}

function isNullPointerType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "int";
}

function isInputTargetType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name !== "void";
}

function containsVoid(type: TypeNode): boolean {
  if (isPrimitiveType(type)) {
    return type.name === "void";
  }
  if (type.kind === "PointerType") {
    return containsVoid(type.pointeeType);
  }
  if (type.kind === "ReferenceType") {
    return containsVoid(type.referredType);
  }
  return containsVoid(type.elementType);
}

function baseElementType(type: TypeNode): TypeNode {
  if (type.kind === "ArrayType") {
    return baseElementType(type.elementType);
  }
  return type;
}

function unwrapReference(type: TypeNode | null): TypeNode | null {
  if (type === null) {
    return null;
  }
  return type.kind === "ReferenceType" ? type.referredType : type;
}

function containsReferenceBelowTopLevel(type: TypeNode): boolean {
  if (type.kind === "ReferenceType") {
    return false;
  }
  return containsReferenceNested(type);
}

function containsReferenceNested(type: TypeNode): boolean {
  if (type.kind === "ReferenceType") {
    return true;
  }
  if (type.kind === "PointerType") {
    return containsReferenceNested(type.pointeeType);
  }
  if (type.kind === "ArrayType" || type.kind === "VectorType") {
    return containsReferenceNested(type.elementType);
  }
  return false;
}

function inferLValueType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  if (!isAssignableExpr(expr)) {
    pushError(context, expr.line, expr.col, "expression is not assignable");
    return null;
  }
  return inferExprType(expr, context);
}

function validateReferenceBinding(
  expr: ExprNode,
  expected: TypeNode,
  context: ValidationContext,
  message = "reference initializer must be an lvalue",
): void {
  const actual = validateExpr(expr, context);
  if (!isAssignableExpr(expr)) {
    pushError(context, expr.line, expr.col, message);
    return;
  }
  if (actual !== null && !isAssignable(actual, expected)) {
    pushError(
      context,
      expr.line,
      expr.col,
      `cannot convert '${typeToString(actual)}' to '${typeToString(expected)}'`,
    );
  }
}

function validateArgumentAgainstParam(
  arg: ExprNode,
  paramType: TypeNode | undefined,
  context: ValidationContext,
): void {
  if (paramType === undefined) {
    validateExpr(arg, context);
    return;
  }
  if (isReferenceType(paramType)) {
    validateReferenceBinding(
      arg,
      paramType.referredType,
      context,
      "reference argument must be an lvalue",
    );
    return;
  }
  if (
    paramType.kind === "PointerType" &&
    arg.kind === "Literal" &&
    arg.valueType === "int" &&
    arg.value === 0n
  ) {
    return;
  }
  validateExpr(arg, context, paramType);
}

function getIterableElementType(
  sourceType: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  if (sourceType.kind === "ArrayType" || sourceType.kind === "VectorType") {
    return sourceType.elementType;
  }
  if (isStringType(sourceType)) {
    return { kind: "PrimitiveType", name: "string" };
  }
  pushError(context, line, col, "range-based for requires array, vector, or string");
  return null;
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
