import type {
  ArrayDeclNode,
  BlockStmtNode,
  DeclGroupStmtNode,
  ExprStmtNode,
  ForInitNode,
  ForStmtNode,
  FunctionDeclNode,
  IfStmtNode,
  ParamNode,
  RangeForStmtNode,
  ReturnStmtNode,
  StatementNode,
  TemplateFunctionDeclNode,
  TypeNode,
  VarDeclNode,
  VectorDeclNode,
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
    case "VectorDecl":
      return substituteVectorDecl(stmt, map);
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
    case "CoutStmt":
    case "CerrStmt":
    case "CinStmt":
    case "BreakStmt":
    case "ContinueStmt":
      return stmt;
  }
}

function substituteVarDecl(decl: VarDeclNode, map: TypeArgMap): VarDeclNode {
  return { ...decl, type: substituteTypeNode(decl.type, map) };
}

function substituteArrayDecl(decl: ArrayDeclNode, map: TypeArgMap): ArrayDeclNode {
  const newType = substituteTypeNode(decl.type, map);
  if (newType.kind !== "ArrayType") return decl;
  return { ...decl, type: newType };
}

function substituteVectorDecl(decl: VectorDeclNode, map: TypeArgMap): VectorDeclNode {
  const newType = substituteTypeNode(decl.type, map);
  if (newType.kind !== "TemplateInstanceType" || newType.template.name !== "vector") return decl;
  return { ...decl, type: newType as VectorDeclNode["type"] };
}

function substituteDeclGroup(stmt: DeclGroupStmtNode, map: TypeArgMap): DeclGroupStmtNode {
  return {
    ...stmt,
    declarations: stmt.declarations.map((d) => {
      if (d.kind === "VarDecl") return substituteVarDecl(d, map);
      if (d.kind === "ArrayDecl") return substituteArrayDecl(d, map);
      return substituteVectorDecl(d, map);
    }),
  };
}

function substituteRangeFor(stmt: RangeForStmtNode, map: TypeArgMap): RangeForStmtNode {
  return {
    ...stmt,
    itemType: stmt.itemType !== null ? substituteTypeNode(stmt.itemType, map) : null,
  };
}

function substituteIf(stmt: IfStmtNode, map: TypeArgMap): IfStmtNode {
  return {
    ...stmt,
    branches: stmt.branches.map((b) => ({ ...b, thenBlock: substituteBlock(b.thenBlock, map) })),
    elseBlock: stmt.elseBlock !== null ? substituteBlock(stmt.elseBlock, map) : null,
  };
}

function substituteFor(stmt: ForStmtNode, map: TypeArgMap): ForStmtNode {
  const init = substituteForInit(stmt.init, map);
  return { ...stmt, init, body: substituteBlock(stmt.body, map) };
}

function substituteForInit(init: ForInitNode, map: TypeArgMap): ForInitNode {
  if (init.kind === "varDecl") return { ...init, value: substituteVarDecl(init.value, map) };
  if (init.kind === "declGroup")
    return { ...init, value: init.value.map((d) => substituteVarDecl(d, map)) };
  return init;
}

function substituteWhile(stmt: WhileStmtNode, map: TypeArgMap): WhileStmtNode {
  return { ...stmt, body: substituteBlock(stmt.body, map) };
}

function substituteReturn(stmt: ReturnStmtNode, map: TypeArgMap): ReturnStmtNode {
  return stmt;
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
