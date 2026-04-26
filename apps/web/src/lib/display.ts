import { getArrayRef } from "./state";

export type PlaygroundArrayView = {
  dynamic: boolean;
  values: string[];
};

export function getArrayView(
  value: string,
  arraysByRef: Map<number, PlaygroundArrayView>
): PlaygroundArrayView | null {
  const ref = getArrayRef(value);
  if (ref === null) {
    return null;
  }

  return arraysByRef.get(ref) ?? null;
}

export function formatArrayLabel(arrayView: PlaygroundArrayView): string {
  const kind = arrayView.dynamic ? "vector" : "array";
  return `${kind}[${arrayView.values.length}]`;
}

export function formatVariableKind(kind: string, arrayView: PlaygroundArrayView | null): string {
  if (arrayView === null) {
    return kind;
  }

  return formatArrayLabel(arrayView);
}

export function formatVariablePreview(
  value: string,
  arraysByRef: Map<number, PlaygroundArrayView>
): string {
  const arrayView = getArrayView(value, arraysByRef);
  if (arrayView === null) {
    return value;
  }

  const previewItems = arrayView.values.slice(0, 6);
  const preview = previewItems.join(", ");
  if (arrayView.values.length > 6) {
    return `[${preview}, ...]`;
  }

  return `[${preview}]`;
}

export function formatMetricsText(
  line: number,
  stepCount: number,
  pauseReason: string | null,
  breakpointCount: number
): string {
  const parts = [`L${line}`, `${stepCount}steps`];

  if (pauseReason) {
    parts.push(pauseReason);
  }

  if (breakpointCount > 0) {
    parts.push(`${breakpointCount}bp`);
  }

  return parts.join(" · ");
}
