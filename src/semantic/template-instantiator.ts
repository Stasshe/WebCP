import type {
  ArrayDeclNode,
  AssignTargetNode,
  BlockStmtNode,
  CinStmtNode,
  CoutStmtNode,
  DeclGroupStmtNode,
  ExprNode,
  ExprStmtNode,
  ForInitNode,
  ForStmtNode,
  FunctionDeclNode,
  IfStmtNode,
  ParamNode,
  RangeForStmtNode,
  ReturnStmtNode,
  StatementNode,
  TemplateArgNode,
  TemplateFunctionDeclNode,
  TypeNode,
  VarDeclNode,
  WhileStmtNode,
} from "@/types";
import { isPointerType, isReferenceType, isTemplateInstanceType } from "@/types";
import { sameType } from "./type-compat";

export type TypeArgMap = Map<string, TypeNode>;

export function substituteTypeNode(type: TypeNode, map: TypeArgMap): TypeNode {
  switch (type.kind) {
    case "NamedType":
      return map.get(type.name) ?? type;
    case "PrimitiveType":
      return type;
    case "ArrayType":
      return { ...type, elementType: substituteTypeNode(type.elementType, map) };
    case "PointerType":
      return { ...type, pointeeType: substituteTypeNode(type.pointeeType, map) };
    case "ReferenceType":
      return { ...type, referredType: substituteTypeNode(type.referredType, map) };
    case "TemplateInstanceType":
      return {
        ...type,
        templateArgs: type.templateArgs.map((a) => substituteTypeNode(a, map)),
      };
  }
}

export function instantiateFunction(
  decl: TemplateFunctionDeclNode,
  map: TypeArgMap,
): FunctionDeclNode {
  return {
    kind: "FunctionDecl",
    returnType: substituteTypeNode(decl.returnType, map),
    name: decl.name,
    params: decl.params.map((p) => substituteParam(p, map)),
    body: substituteBlock(decl.body, map),
    line: decl.line,
    col: decl.col,
    endLine: decl.endLine,
    endCol: decl.endCol,
  };
}

function substituteParam(param: ParamNode, map: TypeArgMap): ParamNode {
  return { ...param, type: substituteTypeNode(param.type, map) };
}

function substituteBlock(block: BlockStmtNode, map: TypeArgMap): BlockStmtNode {
  return { ...block, statements: block.statements.map((s) => substituteStmt(s, map)) };
}

function substituteStmt(stmt: StatementNode, map: TypeArgMap): StatementNode {
  switch (stmt.kind) {
    case "BlockStmt":
      return substituteBlock(stmt, map);
    case "VarDecl":
      return substituteVarDecl(stmt, map);
    case "ArrayDecl":
      return substituteArrayDecl(stmt, map);
    case "DeclGroupStmt":
      return substituteDeclGroup(stmt, map);
    case "RangeForStmt":
      return substituteRangeFor(stmt, map);
    case "IfStmt":
      return substituteIf(stmt, map);
    case "ForStmt":
      return substituteFor(stmt, map);
    case "WhileStmt":
      return substituteWhile(stmt, map);
    case "ReturnStmt":
      return substituteReturn(stmt, map);
    case "ExprStmt":
      return { ...stmt, expression: substituteExpr(stmt.expression, map) };
    case "CoutStmt":
      return { ...stmt, values: stmt.values.map((e) => substituteExpr(e, map)) };
    case "CerrStmt":
      return { ...stmt, values: stmt.values.map((e) => substituteExpr(e, map)) };
    case "CinStmt":
      return { ...stmt, targets: stmt.targets.map((t) => substituteAssignTarget(t, map)) };
    case "BreakStmt":
    case "ContinueStmt":
      return stmt;
  }
}

function substituteAssignTarget(target: AssignTargetNode, map: TypeArgMap): AssignTargetNode {
  switch (target.kind) {
    case "Identifier":
      return target;
    case "IndexExpr":
      return {
        ...target,
        target: substituteExpr(target.target, map),
        index: substituteExpr(target.index, map),
      };
    case "DerefExpr":
      return { ...target, pointer: substituteExpr(target.pointer, map) };
    case "MemberAccessExpr":
      return { ...target, receiver: substituteExpr(target.receiver, map) };
    case "TemplateCallExpr":
      return substituteTemplateCallAsAssignTarget(target, map);
  }
}

function substituteTemplateCallAsAssignTarget(
  target: Extract<AssignTargetNode, { kind: "TemplateCallExpr" }>,
  map: TypeArgMap,
): Extract<AssignTargetNode, { kind: "TemplateCallExpr" }> {
  return {
    ...target,
    callee: {
      ...target.callee,
      templateArgs: target.callee.templateArgs.map((a) => substituteTemplateArg(a, map)),
    },
    args: target.args.map((a) => substituteExpr(a, map)),
  };
}

function substituteExpr(expr: ExprNode, map: TypeArgMap): ExprNode {
  switch (expr.kind) {
    case "Literal":
    case "Identifier":
      return expr;
    case "AssignExpr":
      return {
        ...expr,
        target: substituteAssignTarget(expr.target, map),
        value: substituteExpr(expr.value, map),
      };
    case "ConditionalExpr":
      return {
        ...expr,
        condition: substituteExpr(expr.condition, map),
        thenExpr: substituteExpr(expr.thenExpr, map),
        elseExpr: substituteExpr(expr.elseExpr, map),
      };
    case "BinaryExpr":
      return {
        ...expr,
        left: substituteExpr(expr.left, map),
        right: substituteExpr(expr.right, map),
      };
    case "UnaryExpr":
      return { ...expr, operand: substituteExpr(expr.operand, map) };
    case "AddressOfExpr":
      return { ...expr, target: substituteAssignTarget(expr.target, map) };
    case "DerefExpr":
      return { ...expr, pointer: substituteExpr(expr.pointer, map) };
    case "CallExpr":
      return { ...expr, args: expr.args.map((a) => substituteExpr(a, map)) };
    case "TemplateIdExpr":
      return {
        ...expr,
        templateArgs: expr.templateArgs.map((a) => substituteTemplateArg(a, map)),
      };
    case "TemplateCallExpr":
      return {
        ...expr,
        callee: {
          ...expr.callee,
          templateArgs: expr.callee.templateArgs.map((a) => substituteTemplateArg(a, map)),
        },
        args: expr.args.map((a) => substituteExpr(a, map)),
      };
    case "MemberAccessExpr":
      return { ...expr, receiver: substituteExpr(expr.receiver, map) };
    case "MethodCallExpr":
      return {
        ...expr,
        receiver: substituteExpr(expr.receiver, map),
        args: expr.args.map((a) => substituteExpr(a, map)),
      };
    case "IndexExpr":
      return {
        ...expr,
        target: substituteExpr(expr.target, map),
        index: substituteExpr(expr.index, map),
      };
  }
}

function substituteTemplateArg(arg: TemplateArgNode, map: TypeArgMap): TemplateArgNode {
  if (arg.kind === "TypeTemplateArg") {
    return { ...arg, type: substituteTypeNode(arg.type, map) };
  }
  return arg;
}

function substituteVarDecl(decl: VarDeclNode, map: TypeArgMap): VarDeclNode {
  return {
    ...decl,
    type: substituteTypeNode(decl.type, map),
    initializer: decl.initializer !== null ? substituteExpr(decl.initializer, map) : null,
  };
}

function substituteArrayDecl(decl: ArrayDeclNode, map: TypeArgMap): ArrayDeclNode {
  const newType = substituteTypeNode(decl.type, map);
  if (newType.kind !== "ArrayType") return decl;
  return {
    ...decl,
    type: newType,
    initializers: decl.initializers.map((e) => substituteExpr(e, map)),
  };
}

function substituteDeclGroup(stmt: DeclGroupStmtNode, map: TypeArgMap): DeclGroupStmtNode {
  return {
    ...stmt,
    declarations: stmt.declarations.map((d) => {
      if (d.kind === "VarDecl") return substituteVarDecl(d, map);
      return substituteArrayDecl(d, map);
    }),
  };
}

function substituteRangeFor(stmt: RangeForStmtNode, map: TypeArgMap): RangeForStmtNode {
  return {
    ...stmt,
    itemType: stmt.itemType !== null ? substituteTypeNode(stmt.itemType, map) : null,
    source: substituteExpr(stmt.source, map),
    body: substituteBlock(stmt.body, map),
  };
}

function substituteIf(stmt: IfStmtNode, map: TypeArgMap): IfStmtNode {
  return {
    ...stmt,
    branches: stmt.branches.map((b) => ({
      ...b,
      condition: substituteExpr(b.condition, map),
      thenBlock: substituteBlock(b.thenBlock, map),
    })),
    elseBlock: stmt.elseBlock !== null ? substituteBlock(stmt.elseBlock, map) : null,
  };
}

function substituteFor(stmt: ForStmtNode, map: TypeArgMap): ForStmtNode {
  return {
    ...stmt,
    init: substituteForInit(stmt.init, map),
    condition: stmt.condition !== null ? substituteExpr(stmt.condition, map) : null,
    update: stmt.update !== null ? substituteExpr(stmt.update, map) : null,
    body: substituteBlock(stmt.body, map),
  };
}

function substituteForInit(init: ForInitNode, map: TypeArgMap): ForInitNode {
  if (init.kind === "varDecl") return { ...init, value: substituteVarDecl(init.value, map) };
  if (init.kind === "declGroup")
    return { ...init, value: init.value.map((d) => substituteVarDecl(d, map)) };
  if (init.kind === "expr") return { ...init, value: substituteExpr(init.value, map) };
  return init;
}

function substituteWhile(stmt: WhileStmtNode, map: TypeArgMap): WhileStmtNode {
  return {
    ...stmt,
    condition: substituteExpr(stmt.condition, map),
    body: substituteBlock(stmt.body, map),
  };
}

function substituteReturn(stmt: ReturnStmtNode, map: TypeArgMap): ReturnStmtNode {
  return { ...stmt, value: stmt.value !== null ? substituteExpr(stmt.value, map) : null };
}

export function inferTypeArgs(
  typeParams: string[],
  params: ParamNode[],
  argTypes: (TypeNode | null)[],
): TypeArgMap | null {
  const map: TypeArgMap = new Map();
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i];
    const argType = argTypes[i];
    if (param === undefined || argType === null || argType === undefined) continue;
    if (!inferFromPair(param.type, argType, typeParams, map)) {
      return null;
    }
  }
  for (const tp of typeParams) {
    if (!map.has(tp)) return null;
  }
  return map;
}

function inferFromPair(
  paramType: TypeNode,
  argType: TypeNode,
  typeParams: string[],
  map: TypeArgMap,
): boolean {
  if (paramType.kind === "NamedType" && typeParams.includes(paramType.name)) {
    const concrete = stripRef(argType);
    const existing = map.get(paramType.name);
    if (existing === undefined) {
      map.set(paramType.name, concrete);
      return true;
    }
    return sameType(existing, concrete);
  }
  if (isReferenceType(paramType)) {
    return inferFromPair(paramType.referredType, argType, typeParams, map);
  }
  if (isPointerType(paramType)) {
    return (
      isPointerType(argType) &&
      inferFromPair(paramType.pointeeType, argType.pointeeType, typeParams, map)
    );
  }
  if (isTemplateInstanceType(paramType)) {
    if (
      !isTemplateInstanceType(argType) ||
      paramType.template.name !== argType.template.name ||
      paramType.templateArgs.length !== argType.templateArgs.length
    ) {
      return false;
    }
    for (let i = 0; i < paramType.templateArgs.length; i += 1) {
      const pt = paramType.templateArgs[i];
      const at = argType.templateArgs[i];
      if (pt !== undefined && at !== undefined) {
        if (!inferFromPair(pt, at, typeParams, map)) {
          return false;
        }
      }
    }
    return true;
  }
  return true;
}

function stripRef(type: TypeNode): TypeNode {
  return isReferenceType(type) ? type.referredType : type;
}

export function instantiationKey(name: string, map: TypeArgMap, typeParams: string[]): string {
  const args = typeParams.map((p) => {
    const t = map.get(p);
    return t !== undefined ? typeNodeKey(t) : "?";
  });
  return `${name}<${args.join(",")}>`;
}

function typeNodeKey(type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return type.name;
    case "NamedType":
      return type.name;
    case "ArrayType":
      return `arr(${typeNodeKey(type.elementType)})`;
    case "PointerType":
      return `ptr(${typeNodeKey(type.pointeeType)})`;
    case "ReferenceType":
      return `ref(${typeNodeKey(type.referredType)})`;
    case "TemplateInstanceType":
      return `${type.template.name}<${type.templateArgs.map(typeNodeKey).join(",")}>`;
  }
}
