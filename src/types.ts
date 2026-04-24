export type PrimitiveTypeName = "int" | "long long" | "bool" | "string" | "void";

export type SourceLocation = {
  line: number;
  col: number;
};

export type NodeBase = SourceLocation;

export type ProgramNode = NodeBase & {
  kind: "Program";
  globals: VarDeclNode[];
  functions: FunctionDeclNode[];
};

export type FunctionDeclNode = NodeBase & {
  kind: "FunctionDecl";
  returnType: PrimitiveTypeName;
  name: string;
  params: ParamNode[];
  body: BlockStmtNode;
};

export type ParamNode = NodeBase & {
  kind: "Param";
  typeName: PrimitiveTypeName;
  name: string;
};

export type StatementNode =
  | BlockStmtNode
  | VarDeclNode
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

export type VarDeclNode = NodeBase & {
  kind: "VarDecl";
  typeName: PrimitiveTypeName;
  name: string;
  initializer: ExprNode | null;
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
  targets: IdentifierExprNode[];
};

export type ExprNode =
  | AssignExprNode
  | BinaryExprNode
  | UnaryExprNode
  | CallExprNode
  | IdentifierExprNode
  | LiteralExprNode;

export type AssignExprNode = NodeBase & {
  kind: "AssignExpr";
  operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  target: IdentifierExprNode;
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

export type RunStatus = "done" | "error";

export type RunResult = {
  status: RunStatus;
  output: InterpreterOutput;
  error: RuntimeErrorInfo | null;
};
