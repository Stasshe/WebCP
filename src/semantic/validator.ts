import {
  getSupportedTemplateTypeSpec,
} from "@/stdlib/registry";
import { vectorElementType } from "@/stdlib/template-types";
import { vectorType } from "@/types";
import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  ProgramNode,
  RangeForStmtNode,
  StatementNode,
  TypeNode,
} from "@/types";
import {
  isArrayType,
  isMapType,
  isPairType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTupleType,
  isVectorType,
  pairType,
  typeToString,
} from "@/types";
import {
  mapKeyType,
  mapValueType,
  pairFirstType,
  pairSecondType,
} from "@/stdlib/template-types";
import { sameType, isAssignable, isAssignableExpr, inferBinaryType, resolveConditionalType } from "./type-compat";
import {
  isIntType,
  isDoubleType,
  isNumericType,
  isBoolType,
  isStringType,
  isNullPointerConstantExpr,
  isNullPointerType,
  isInputTargetType,
  containsVoid,
  containsReferenceBelowTopLevel,
  baseElementType,
  unwrapReference,
} from "./type-utils";
import {
  validateBuiltinCall,
  validateTemplateCall,
  validateMethodCall,
  type ValidationContext,
} from "./builtin-checker";

export { type ValidationContext };

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
      errors.push({ line: fn.line, col: fn.col, message: `redefinition of function '${fn.name}'` });
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
      context, fn.line, fn.col,
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
      if (isArrayType(stmt.type) || isVectorType(stmt.type)) {
        pushError(context, stmt.line, stmt.col, `variable type cannot be '${typeToString(stmt.type)}'`);
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
      if (containsReferenceBelowTopLevel(vectorElementType(stmt.type))) {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be reference");
      }
      if (stmt.constructorArgs.length >= 1) {
        validateExpr(stmt.constructorArgs[0] ?? null, context, "int");
      }
      if (stmt.constructorArgs.length >= 2) {
        validateExpr(stmt.constructorArgs[1] ?? null, context, vectorElementType(stmt.type));
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
      context, stmt.line, stmt.col,
      `cannot convert '${typeToString(elementType ?? itemType)}' to '${typeToString(itemType)}'`,
    );
  }

  pushScope(context);
  defineSymbol(
    stmt.itemName,
    stmt.itemByReference ? { kind: "ReferenceType", referredType: itemType } : itemType,
    stmt.line, stmt.col, context,
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
      pushError(context, stmt.line, stmt.col, "return-statement with a value, in function returning 'void'");
    }
    return;
  }
  if (stmt.value === null) {
    pushError(context, stmt.line, stmt.col, "return-statement with no value, in function returning non-void");
    return;
  }
  validateExpr(stmt.value, context, returnType);
}

export function validateExpr(
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
        context, expr.line, expr.col,
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

export function inferExprType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  switch (expr.kind) {
    case "Literal":
      if (expr.valueType === "int") return { kind: "PrimitiveType", name: "int" };
      if (expr.valueType === "double") return { kind: "PrimitiveType", name: "double" };
      if (expr.valueType === "bool") return { kind: "PrimitiveType", name: "bool" };
      if (expr.valueType === "char") return { kind: "PrimitiveType", name: "char" };
      return { kind: "PrimitiveType", name: "string" };
    case "Identifier":
      if (expr.name === "endl") return { kind: "PrimitiveType", name: "string" };
      return unwrapReference(resolveSymbol(expr.name, expr.line, expr.col, context));
    case "IndexExpr": {
      const targetType = inferExprType(expr.target, context);
      if (targetType === null) return null;
      if (isStringType(targetType)) {
        validateExpr(expr.index, context, "int");
        return { kind: "PrimitiveType", name: "char" };
      }
      if (isArrayType(targetType) || isVectorType(targetType)) {
        validateExpr(expr.index, context, "int");
        return isArrayType(targetType) ? targetType.elementType : vectorElementType(targetType);
      }
      if (isMapType(targetType)) {
        validateExpr(expr.index, context, mapKeyType(targetType));
        return mapValueType(targetType);
      }
      pushError(context, expr.line, expr.col, "type mismatch: expected array/vector/map/string");
      return null;
    }
    case "AddressOfExpr": {
      const targetType = inferLValueType(expr.target, context);
      return targetType === null ? null : { kind: "PointerType", pointeeType: targetType };
    }
    case "DerefExpr": {
      const ptrType = inferExprType(expr.pointer, context);
      if (ptrType === null) return null;
      if (ptrType.kind !== "PointerType") {
        pushError(context, expr.line, expr.col, "type mismatch: expected pointer");
        return null;
      }
      return ptrType.pointeeType;
    }
    case "TemplateIdExpr":
      if (getSupportedTemplateTypeSpec(expr.template) !== null) {
        return null;
      }
      pushError(context, expr.line, expr.col, `'${typeToString({ kind: "NamedType", name: expr.template })}' does not name a value`);
      return null;
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
    case "ConditionalExpr": {
      validateConditionExpr(expr.condition, context);
      const thenType = validateExpr(expr.thenExpr, context);
      const elseType = validateExpr(expr.elseExpr, context);
      const resultType = resolveConditionalType(
        thenType, elseType, expr.line, expr.col,
        (line, col, msg) => pushError(context, line, col, msg),
      );
      expr.resolvedType = resultType;
      return resultType;
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
      return inferBinaryType(expr, left, right, (line, col, msg) => pushError(context, line, col, msg));
    }
    case "CallExpr":
      return validateCall(expr.callee, expr.args, expr.line, expr.col, context);
    case "TemplateCallExpr":
      return validateTemplateCall(expr, context, validateExpr, inferExprType);
    case "MethodCallExpr":
      return validateMethodCall(
        expr.receiver, expr.method, expr.args, expr.line, expr.col,
        context, validateExpr, inferExprType,
      );
  }
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
      if (arg === undefined) continue;
      validateArgumentAgainstParam(arg, param?.type, context);
    }
    return fn.returnType;
  }

  const builtin = validateBuiltinCall(callee, args, line, col, context, validateExpr, inferExprType);
  if (builtin !== undefined) {
    return builtin;
  }

  pushError(context, line, col, `'${callee}' was not declared in this scope`);
  for (const arg of args) {
    validateExpr(arg, context);
  }
  return null;
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
  if (scope === undefined) return;
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
  if (expected === "bool") return { kind: "PrimitiveType", name: "bool" };
  if (expected === "int") return { kind: "PrimitiveType", name: "int" };
  return expected;
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
      context, expr.line, expr.col,
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
    validateReferenceBinding(arg, paramType.referredType, context, "reference argument must be an lvalue");
    return;
  }
  if (isPointerType(paramType) && arg.kind === "Literal" && arg.valueType === "int" && arg.value === 0n) {
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
  if (isArrayType(sourceType) || isVectorType(sourceType)) {
    return isArrayType(sourceType) ? sourceType.elementType : vectorElementType(sourceType);
  }
  if (isMapType(sourceType)) {
    return pairType(mapKeyType(sourceType), mapValueType(sourceType));
  }
  if (isStringType(sourceType)) {
    return { kind: "PrimitiveType", name: "char" };
  }
  pushError(context, line, col, "range-based for requires array, vector, map, or string");
  return null;
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
