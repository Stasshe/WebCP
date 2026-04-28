export type SupportedTemplateTypeName = "vector" | "map" | "pair" | "tuple";
export type UnsupportedTemplateTypeName =
  | "unordered_map"
  | "priority_queue"
  | "set"
  | "unordered_set";
export type BuiltinRangeAlgorithmName = "sort" | "reverse" | "fill";
export type BuiltinValueFunctionName = "abs" | "max" | "min" | "swap";
export type BuiltinTemplateFactoryName = "make_pair" | "make_tuple";
export type BuiltinTemplateComparatorName = "greater";

export type SupportedTemplateTypeSpec = {
  kind: "template_type";
  name: SupportedTemplateTypeName;
  arity: number;
};

export type UnsupportedTemplateTypeSpec = {
  kind: "unsupported_template_type";
  name: UnsupportedTemplateTypeName;
};

export type BuiltinRangeAlgorithmSpec = {
  kind: "range_algorithm";
  name: BuiltinRangeAlgorithmName;
  minArgs: number;
  maxArgs: number;
};

export type BuiltinValueFunctionSpec = {
  kind: "value_function";
  name: BuiltinValueFunctionName;
  minArgs: number;
  maxArgs: number;
};

export type BuiltinTemplateFactorySpec = {
  kind: "template_factory";
  name: BuiltinTemplateFactoryName;
  minArgs: number;
  maxArgs: number;
};

export type BuiltinTemplateComparatorSpec = {
  kind: "template_comparator";
  name: BuiltinTemplateComparatorName;
  minTypeArgs: number;
  maxTypeArgs: number;
  callArgs: number;
};

const SUPPORTED_TEMPLATE_TYPE_SPECS: Record<SupportedTemplateTypeName, SupportedTemplateTypeSpec> =
  {
    vector: { kind: "template_type", name: "vector", arity: 1 },
    map: { kind: "template_type", name: "map", arity: 2 },
    pair: { kind: "template_type", name: "pair", arity: 2 },
    tuple: { kind: "template_type", name: "tuple", arity: -1 },
  };

const UNSUPPORTED_TEMPLATE_TYPE_SPECS: Record<
  UnsupportedTemplateTypeName,
  UnsupportedTemplateTypeSpec
> = {
  unordered_map: { kind: "unsupported_template_type", name: "unordered_map" },
  priority_queue: { kind: "unsupported_template_type", name: "priority_queue" },
  set: { kind: "unsupported_template_type", name: "set" },
  unordered_set: { kind: "unsupported_template_type", name: "unordered_set" },
};

const BUILTIN_RANGE_ALGORITHM_SPECS: Record<BuiltinRangeAlgorithmName, BuiltinRangeAlgorithmSpec> =
  {
    sort: { kind: "range_algorithm", name: "sort", minArgs: 2, maxArgs: 3 },
    reverse: { kind: "range_algorithm", name: "reverse", minArgs: 2, maxArgs: 2 },
    fill: { kind: "range_algorithm", name: "fill", minArgs: 3, maxArgs: 3 },
  };

const BUILTIN_VALUE_FUNCTION_SPECS: Record<BuiltinValueFunctionName, BuiltinValueFunctionSpec> = {
  abs: { kind: "value_function", name: "abs", minArgs: 1, maxArgs: 1 },
  max: { kind: "value_function", name: "max", minArgs: 2, maxArgs: 2 },
  min: { kind: "value_function", name: "min", minArgs: 2, maxArgs: 2 },
  swap: { kind: "value_function", name: "swap", minArgs: 2, maxArgs: 2 },
};

const BUILTIN_TEMPLATE_FACTORY_SPECS: Record<
  BuiltinTemplateFactoryName,
  BuiltinTemplateFactorySpec
> = {
  make_pair: { kind: "template_factory", name: "make_pair", minArgs: 2, maxArgs: 2 },
  make_tuple: {
    kind: "template_factory",
    name: "make_tuple",
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
  },
};

const BUILTIN_TEMPLATE_COMPARATOR_SPECS: Record<
  BuiltinTemplateComparatorName,
  BuiltinTemplateComparatorSpec
> = {
  greater: {
    kind: "template_comparator",
    name: "greater",
    minTypeArgs: 1,
    maxTypeArgs: 1,
    callArgs: 0,
  },
};

export function getSupportedTemplateTypeSpec(value: string): SupportedTemplateTypeSpec | null {
  return SUPPORTED_TEMPLATE_TYPE_SPECS[value as SupportedTemplateTypeName] ?? null;
}

export function getUnsupportedTemplateTypeSpec(value: string): UnsupportedTemplateTypeSpec | null {
  return UNSUPPORTED_TEMPLATE_TYPE_SPECS[value as UnsupportedTemplateTypeName] ?? null;
}

export function getBuiltinRangeAlgorithmSpec(value: string): BuiltinRangeAlgorithmSpec | null {
  return BUILTIN_RANGE_ALGORITHM_SPECS[value as BuiltinRangeAlgorithmName] ?? null;
}

export function getBuiltinValueFunctionSpec(value: string): BuiltinValueFunctionSpec | null {
  return BUILTIN_VALUE_FUNCTION_SPECS[value as BuiltinValueFunctionName] ?? null;
}

export function getBuiltinTemplateFactorySpec(value: string): BuiltinTemplateFactorySpec | null {
  return BUILTIN_TEMPLATE_FACTORY_SPECS[value as BuiltinTemplateFactoryName] ?? null;
}

export function getBuiltinTemplateComparatorSpec(
  value: string,
): BuiltinTemplateComparatorSpec | null {
  return BUILTIN_TEMPLATE_COMPARATOR_SPECS[value as BuiltinTemplateComparatorName] ?? null;
}

export function describeBuiltinArity(spec: { minArgs: number; maxArgs: number }): string {
  if (spec.maxArgs === Number.POSITIVE_INFINITY) {
    return `at least ${spec.minArgs.toString()}`;
  }
  if (spec.minArgs === spec.maxArgs) {
    return `exactly ${spec.minArgs.toString()}`;
  }
  return `${spec.minArgs.toString()} or ${spec.maxArgs.toString()}`;
}

export function isSupportedTemplateTypeName(value: string): value is SupportedTemplateTypeName {
  return getSupportedTemplateTypeSpec(value) !== null;
}

export function isUnsupportedTemplateTypeName(value: string): value is UnsupportedTemplateTypeName {
  return getUnsupportedTemplateTypeSpec(value) !== null;
}

export function isBuiltinRangeAlgorithmName(value: string): value is BuiltinRangeAlgorithmName {
  return getBuiltinRangeAlgorithmSpec(value) !== null;
}

export function isBuiltinValueFunctionName(value: string): value is BuiltinValueFunctionName {
  return getBuiltinValueFunctionSpec(value) !== null;
}

export function isBuiltinTemplateFactoryName(value: string): value is BuiltinTemplateFactoryName {
  return getBuiltinTemplateFactorySpec(value) !== null;
}

export function isBuiltinTemplateComparatorName(
  value: string,
): value is BuiltinTemplateComparatorName {
  return getBuiltinTemplateComparatorSpec(value) !== null;
}
