const SUPPORTED_TEMPLATE_TYPE_NAMES = ["vector", "map", "pair", "tuple"] as const;
const UNSUPPORTED_TEMPLATE_TYPE_NAMES = [
  "unordered_map",
  "priority_queue",
  "set",
  "unordered_set",
] as const;
const BUILTIN_RANGE_ALGORITHM_NAMES = ["sort", "reverse", "fill"] as const;
const BUILTIN_VALUE_FUNCTION_NAMES = ["abs", "max", "min", "swap"] as const;
const BUILTIN_TEMPLATE_FACTORY_NAMES = ["make_pair", "make_tuple"] as const;
const BUILTIN_TEMPLATE_COMPARATOR_NAMES = ["greater"] as const;

type SupportedTemplateTypeName = (typeof SUPPORTED_TEMPLATE_TYPE_NAMES)[number];
type UnsupportedTemplateTypeName = (typeof UNSUPPORTED_TEMPLATE_TYPE_NAMES)[number];
type BuiltinRangeAlgorithmName = (typeof BUILTIN_RANGE_ALGORITHM_NAMES)[number];
type BuiltinValueFunctionName = (typeof BUILTIN_VALUE_FUNCTION_NAMES)[number];
type BuiltinTemplateFactoryName = (typeof BUILTIN_TEMPLATE_FACTORY_NAMES)[number];
type BuiltinTemplateComparatorName = (typeof BUILTIN_TEMPLATE_COMPARATOR_NAMES)[number];

export function isSupportedTemplateTypeName(
  value: string,
): value is SupportedTemplateTypeName {
  return (SUPPORTED_TEMPLATE_TYPE_NAMES as readonly string[]).includes(value);
}

export function isUnsupportedTemplateTypeName(
  value: string,
): value is UnsupportedTemplateTypeName {
  return (UNSUPPORTED_TEMPLATE_TYPE_NAMES as readonly string[]).includes(value);
}

export function isBuiltinRangeAlgorithmName(
  value: string,
): value is BuiltinRangeAlgorithmName {
  return (BUILTIN_RANGE_ALGORITHM_NAMES as readonly string[]).includes(value);
}

export function isBuiltinValueFunctionName(
  value: string,
): value is BuiltinValueFunctionName {
  return (BUILTIN_VALUE_FUNCTION_NAMES as readonly string[]).includes(value);
}

export function isBuiltinTemplateFactoryName(
  value: string,
): value is BuiltinTemplateFactoryName {
  return (BUILTIN_TEMPLATE_FACTORY_NAMES as readonly string[]).includes(value);
}

export function isBuiltinTemplateComparatorName(
  value: string,
): value is BuiltinTemplateComparatorName {
  return (BUILTIN_TEMPLATE_COMPARATOR_NAMES as readonly string[]).includes(value);
}

export function isBuiltinFreeFunctionName(value: string): boolean {
  return (
    isBuiltinValueFunctionName(value) ||
    isBuiltinTemplateFactoryName(value) ||
    isBuiltinRangeAlgorithmName(value) ||
    isBuiltinTemplateComparatorName(value)
  );
}
