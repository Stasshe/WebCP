export type VectorMethodName =
  | "begin"
  | "end"
  | "push_back"
  | "pop_back"
  | "size"
  | "back"
  | "empty"
  | "clear"
  | "resize";

export type VectorMethodReturnKind = "void" | "int" | "bool" | "element" | "self";

export type VectorMethodSpec = {
  name: VectorMethodName;
  minArgs: number;
  maxArgs: number;
  returns: VectorMethodReturnKind;
};

const VECTOR_METHOD_SPECS: Record<VectorMethodName, VectorMethodSpec> = {
  begin: { name: "begin", minArgs: 0, maxArgs: 0, returns: "self" },
  end: { name: "end", minArgs: 0, maxArgs: 0, returns: "self" },
  push_back: { name: "push_back", minArgs: 1, maxArgs: 1, returns: "void" },
  pop_back: { name: "pop_back", minArgs: 0, maxArgs: 0, returns: "void" },
  size: { name: "size", minArgs: 0, maxArgs: 0, returns: "int" },
  back: { name: "back", minArgs: 0, maxArgs: 0, returns: "element" },
  empty: { name: "empty", minArgs: 0, maxArgs: 0, returns: "bool" },
  clear: { name: "clear", minArgs: 0, maxArgs: 0, returns: "void" },
  resize: { name: "resize", minArgs: 1, maxArgs: 1, returns: "void" },
};

export function getVectorMethodSpec(name: string): VectorMethodSpec | null {
  return VECTOR_METHOD_SPECS[name as VectorMethodName] ?? null;
}

export function isVectorMethodName(name: string): name is VectorMethodName {
  return getVectorMethodSpec(name) !== null;
}

export function describeVectorMethodArgs(spec: VectorMethodSpec): string {
  if (spec.maxArgs === 0) return "no arguments";
  if (spec.minArgs === spec.maxArgs && spec.minArgs === 1) return "exactly 1 argument";
  return `exactly ${spec.minArgs.toString()} arguments`;
}
