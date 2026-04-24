export type PrimitiveTypeName = "int" | "long long" | "bool" | "string" | "void";

export type PrimitiveTypeNode = {
  kind: "PrimitiveType";
  name: PrimitiveTypeName;
};

export type ArrayTypeNode = {
  kind: "ArrayType";
  elementType: PrimitiveTypeNode;
};

export type VectorTypeNode = {
  kind: "VectorType";
  elementType: PrimitiveTypeNode;
};

export type TypeNode = PrimitiveTypeNode | ArrayTypeNode | VectorTypeNode;

export type SourceLocation = {
  line: number;
  col: number;
};

export type NodeBase = SourceLocation;

export type ProgramNode = NodeBase & {
  kind: "Program";
  globals: GlobalDeclNode[];
  functions: FunctionDeclNode[];
};

export type GlobalDeclNode = VarDeclNode | ArrayDeclNode | VectorDeclNode;

export type FunctionDeclNode = NodeBase & {
  kind: "FunctionDecl";
  returnType: TypeNode;
  name: string;
  params: ParamNode[];
  body: BlockStmtNode;
};

export type ParamNode = NodeBase & {
  kind: "Param";
  type: TypeNode;
  name: string;
};

export type StatementNode =
  | BlockStmtNode
  | DeclGroupStmtNode
  | VarDeclNode
  | ArrayDeclNode
  | VectorDeclNode
  | IfStmtNode
  | ForStmtNode
  | WhileStmtNode
  | ReturnStmtNode
  | BreakStmtNode
  | ContinueStmtNode
  | ExprStmtNode
  | CoutStmtNode
  | CerrStmtNode
  | CinStmtNode;

export type BlockStmtNode = NodeBase & {
  kind: "BlockStmt";
  statements: StatementNode[];
};

export type DeclGroupStmtNode = NodeBase & {
  kind: "DeclGroupStmt";
  declarations: Array<VarDeclNode | ArrayDeclNode | VectorDeclNode>;
};

export type VarDeclNode = NodeBase & {
  kind: "VarDecl";
  type: TypeNode;
  name: string;
  initializer: ExprNode | null;
};

export type ArrayDeclNode = NodeBase & {
  kind: "ArrayDecl";
  type: ArrayTypeNode;
  name: string;
  size: bigint;
  initializers: ExprNode[];
};

export type VectorDeclNode = NodeBase & {
  kind: "VectorDecl";
  type: VectorTypeNode;
  name: string;
  constructorArgs: ExprNode[];
};

export type IfStmtNode = NodeBase & {
  kind: "IfStmt";
  branches: Array<{ condition: ExprNode; thenBlock: BlockStmtNode }>;
  elseBlock: BlockStmtNode | null;
};

export type ForStmtNode = NodeBase & {
  kind: "ForStmt";
  init: ForInitNode;
  condition: ExprNode | null;
  update: ExprNode | null;
  body: BlockStmtNode;
};

export type ForInitNode =
  | { kind: "none" }
  | { kind: "varDecl"; value: VarDeclNode }
  | { kind: "declGroup"; value: VarDeclNode[] }
  | { kind: "expr"; value: ExprNode };

export type WhileStmtNode = NodeBase & {
  kind: "WhileStmt";
  condition: ExprNode;
  body: BlockStmtNode;
};

export type ReturnStmtNode = NodeBase & {
  kind: "ReturnStmt";
  value: ExprNode | null;
};

export type BreakStmtNode = NodeBase & {
  kind: "BreakStmt";
};

export type ContinueStmtNode = NodeBase & {
  kind: "ContinueStmt";
};

export type ExprStmtNode = NodeBase & {
  kind: "ExprStmt";
  expression: ExprNode;
};

export type CoutStmtNode = NodeBase & {
  kind: "CoutStmt";
  values: ExprNode[];
};

export type CerrStmtNode = NodeBase & {
  kind: "CerrStmt";
  values: ExprNode[];
};

export type CinStmtNode = NodeBase & {
  kind: "CinStmt";
  targets: AssignTargetNode[];
};

export type ExprNode =
  | AssignExprNode
  | BinaryExprNode
  | UnaryExprNode
  | CallExprNode
  | MethodCallExprNode
  | IndexExprNode
  | IdentifierExprNode
  | LiteralExprNode;

export type AssignTargetNode = IdentifierExprNode | IndexExprNode;

export type AssignExprNode = NodeBase & {
  kind: "AssignExpr";
  operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  target: AssignTargetNode;
  value: ExprNode;
};

export type BinaryExprNode = NodeBase & {
  kind: "BinaryExpr";
  operator:
    | "+"
    | "-"
    | "*"
    | "/"
    | "%"
    | "<"
    | "<="
    | ">"
    | ">="
    | "=="
    | "!="
    | "&&"
    | "||";
  left: ExprNode;
  right: ExprNode;
};

export type UnaryExprNode = NodeBase & {
  kind: "UnaryExpr";
  operator: "!" | "-" | "++" | "--";
  operand: ExprNode;
  isPostfix: boolean;
};

export type CallExprNode = NodeBase & {
  kind: "CallExpr";
  callee: string;
  args: ExprNode[];
};

export type MethodCallExprNode = NodeBase & {
  kind: "MethodCallExpr";
  receiver: ExprNode;
  method: string;
  args: ExprNode[];
};

export type IndexExprNode = NodeBase & {
  kind: "IndexExpr";
  target: ExprNode;
  index: ExprNode;
};

export type IdentifierExprNode = NodeBase & {
  kind: "Identifier";
  name: string;
};

export type LiteralExprNode = NodeBase & {
  kind: "Literal";
  valueType: "int" | "bool" | "string";
  value: bigint | boolean | string;
};

export type TokenKind = "identifier" | "keyword" | "number" | "string" | "symbol" | "eof";

export type Token = SourceLocation & {
  kind: TokenKind;
  text: string;
};

export type CompileError = SourceLocation & {
  message: string;
};

export type RuntimeErrorInfo = {
  message: string;
  line: number;
  functionName: string;
};

export type CompileResult =
  | { ok: true; program: ProgramNode }
  | { ok: false; errors: CompileError[] };

export type InterpreterOutput = {
  stdout: string;
  stderr: string;
};

export type DebugValueView = {
  name: string;
  kind: "int" | "bool" | "string" | "array" | "void" | "uninitialized";
  value: string;
};

export type ScopeView = {
  name: string;
  vars: DebugValueView[];
};

export type ArrayView = {
  ref: number;
  elementType: "int" | "bool" | "string";
  dynamic: boolean;
  values: string[];
};

export type WatchView = {
  expression: string;
  value: string;
};

export type DebugInfo = {
  currentLine: number;
  callStack: FrameView[];
  localVars: ScopeView[];
  globalVars: DebugValueView[];
  arrays: ArrayView[];
  watchList: WatchView[];
};

export type RunStatus = "done" | "paused" | "error";

export type RunResult = {
  status: RunStatus;
  output: InterpreterOutput;
  error: RuntimeErrorInfo | null;
  debugInfo: DebugInfo;
  stepCount: number;
};

export type FrameView = {
  functionName: string;
  line: number;
};

export type DebugState = {
  status: "ready" | "running" | "paused" | "done" | "error";
  currentLine: number;
  callStack: FrameView[];
  output: InterpreterOutput;
  error: RuntimeErrorInfo | null;
  localVars: ScopeView[];
  globalVars: DebugValueView[];
  arrays: ArrayView[];
  watchList: WatchView[];
  stepCount: number;
  pauseReason: "step" | "breakpoint" | null;
};

export function primitiveType(name: PrimitiveTypeName): PrimitiveTypeNode {
  return { kind: "PrimitiveType", name };
}

export function arrayType(elementType: PrimitiveTypeNode): ArrayTypeNode {
  return { kind: "ArrayType", elementType };
}

export function vectorType(elementType: PrimitiveTypeNode): VectorTypeNode {
  return { kind: "VectorType", elementType };
}

export function isPrimitiveType(type: TypeNode): type is PrimitiveTypeNode {
  return type.kind === "PrimitiveType";
}

export function isArrayType(type: TypeNode): type is ArrayTypeNode {
  return type.kind === "ArrayType";
}

export function isVectorType(type: TypeNode): type is VectorTypeNode {
  return type.kind === "VectorType";
}

export function typeToString(type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return type.name;
    case "ArrayType":
      return `${type.elementType.name}[]`;
    case "VectorType":
      return `vector<${type.elementType.name}>`;
  }
}
