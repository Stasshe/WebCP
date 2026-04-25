export type PrimitiveTypeName = "int" | "long long" | "double" | "bool" | "string" | "void";

export type PrimitiveTypeNode = {
  kind: "PrimitiveType";
  name: PrimitiveTypeName;
};

export type ArrayTypeNode = {
  kind: "ArrayType";
  elementType: TypeNode;
};

export type VectorTypeNode = {
  kind: "VectorType";
  elementType: TypeNode;
};

export type PointerTypeNode = {
  kind: "PointerType";
  pointeeType: TypeNode;
};

export type ReferenceTypeNode = {
  kind: "ReferenceType";
  referredType: TypeNode;
};

export type TypeNode =
  | PrimitiveTypeNode
  | ArrayTypeNode
  | VectorTypeNode
  | PointerTypeNode
  | ReferenceTypeNode;

export type SourceLocation = {
  line: number;
  col: number;
};

export type SourceRange = SourceLocation & {
  endLine: number;
  endCol: number;
};

export type NodeBase = SourceRange;

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
  | RangeForStmtNode
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
  dimensions: bigint[];
  initializers: ExprNode[];
};

export type VectorDeclNode = NodeBase & {
  kind: "VectorDecl";
  type: VectorTypeNode;
  name: string;
  constructorArgs: ExprNode[];
};

export type RangeForStmtNode = NodeBase & {
  kind: "RangeForStmt";
  itemName: string;
  itemType: TypeNode | null;
  itemByReference: boolean;
  source: ExprNode;
  body: BlockStmtNode;
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
  | AddressOfExprNode
  | DerefExprNode
  | CallExprNode
  | MethodCallExprNode
  | IndexExprNode
  | IdentifierExprNode
  | LiteralExprNode;

export type AssignTargetNode = IdentifierExprNode | IndexExprNode | DerefExprNode;

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
    | "<<"
    | ">>"
    | "&"
    | "^"
    | "|"
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
  operator: "!" | "-" | "~" | "++" | "--";
  operand: ExprNode;
  isPostfix: boolean;
};

export type AddressOfExprNode = NodeBase & {
  kind: "AddressOfExpr";
  target: AssignTargetNode;
};

export type DerefExprNode = NodeBase & {
  kind: "DerefExpr";
  pointer: ExprNode;
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
  valueType: "int" | "double" | "bool" | "string";
  value: bigint | number | boolean | string;
};

export type TokenKind = "identifier" | "keyword" | "number" | "string" | "symbol" | "eof";

export type Token = SourceRange & {
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
  kind:
    | "int"
    | "double"
    | "bool"
    | "string"
    | "array"
    | "pointer"
    | "reference"
    | "void"
    | "uninitialized";
  value: string;
};

export type ScopeView = {
  name: string;
  vars: DebugValueView[];
};

export type ArrayView = {
  ref: number;
  elementType: string;
  dynamic: boolean;
  values: string[];
};

export type WatchView = {
  expression: string;
  value: string;
};

export type InputStateView = {
  tokens: string[];
  nextIndex: number;
};

export type DebugExecutionRange = {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  level: number;
};

export type DebugInfo = {
  currentLine: number;
  callStack: FrameView[];
  localVars: ScopeView[];
  globalVars: DebugValueView[];
  arrays: ArrayView[];
  watchList: WatchView[];
  input: InputStateView;
  executionRange: DebugExecutionRange | null;
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
  input: InputStateView;
  executionRange: DebugExecutionRange | null;
  stepCount: number;
  pauseReason: "step" | "breakpoint" | null;
};

export function primitiveType(name: PrimitiveTypeName): PrimitiveTypeNode {
  return { kind: "PrimitiveType", name };
}

export function arrayType(elementType: TypeNode): ArrayTypeNode {
  return { kind: "ArrayType", elementType };
}

export function vectorType(elementType: TypeNode): VectorTypeNode {
  return { kind: "VectorType", elementType };
}

export function pointerType(pointeeType: TypeNode): PointerTypeNode {
  return { kind: "PointerType", pointeeType };
}

export function referenceType(referredType: TypeNode): ReferenceTypeNode {
  return { kind: "ReferenceType", referredType };
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

export function isPointerType(type: TypeNode): type is PointerTypeNode {
  return type.kind === "PointerType";
}

export function isReferenceType(type: TypeNode): type is ReferenceTypeNode {
  return type.kind === "ReferenceType";
}

export function typeToString(type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return type.name;
    case "ArrayType":
      return `${typeToString(type.elementType)}[]`;
    case "VectorType":
      return `vector<${typeToString(type.elementType)}>`;
    case "PointerType":
      return `${typeToString(type.pointeeType)}*`;
    case "ReferenceType":
      return `${typeToString(type.referredType)}&`;
  }
}
