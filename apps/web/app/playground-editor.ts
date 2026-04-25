import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  completeFromList,
  completionKeymap,
  completionStatus,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from "@codemirror/language";
import {
  gotoLine,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  crosshairCursor,
  drawSelection,
  gutter,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import type { DebugExecutionRange } from "@clientsidecpp/types";
import { dracula } from "thememirror";

const acMainSnippet = `#include <bits/stdc++.h>
using namespace std;

int main() {
    
}`;

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-breakpoint-marker";
    return dot;
  }
}

class ExecutionMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-execution-marker";
    marker.textContent = "▶";
    return marker;
  }
}

const breakpointMarker = new BreakpointMarker();
const executionMarker = new ExecutionMarker();

export const breakpointCompartment = new Compartment();
export const executionCompartment = new Compartment();

const cppCompletionSource = completeFromList([
  { label: "int", type: "type", boost: 10 },
  { label: "long long", type: "type", boost: 10 },
  { label: "bool", type: "type", boost: 10 },
  { label: "string", type: "type", boost: 10 },
  { label: "vector", type: "type", boost: 10 },
  { label: "if", type: "keyword", boost: 8 },
  { label: "else", type: "keyword", boost: 8 },
  { label: "for", type: "keyword", boost: 8 },
  { label: "while", type: "keyword", boost: 8 },
  { label: "break", type: "keyword", boost: 8 },
  { label: "continue", type: "keyword", boost: 8 },
  { label: "return", type: "keyword", boost: 8 },
  { label: "main", type: "function", boost: 9 },
  { label: "cin", type: "variable", boost: 7 },
  { label: "cout", type: "variable", boost: 7 },
  { label: "endl", type: "constant", boost: 6 },
  { label: "push_back", type: "method", boost: 6 },
  { label: "pop_back", type: "method", boost: 6 },
  { label: "size", type: "method", boost: 6 },
  { label: "back", type: "method", boost: 6 },
  { label: "front", type: "method", boost: 6 },
]);

function createBreakpointGutter(
  breakpoints: number[],
  onToggle: (line: number) => void
) {
  const lines = new Set(breakpoints);
  return gutter({
    class: "cm-breakpoint-gutter",
    markers(view) {
      const builder = new RangeSetBuilder<GutterMarker>();
      for (let index = 1; index <= view.state.doc.lines; index += 1) {
        if (!lines.has(index)) continue;
        const line = view.state.doc.line(index);
        builder.add(line.from, line.from, breakpointMarker);
      }
      return builder.finish();
    },
    initialSpacer() {
      return breakpointMarker;
    },
    domEventHandlers: {
      mousedown: (view, line) => {
        onToggle(view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

function getOffsetForPosition(view: EditorView, lineNumber: number, col: number) {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
    return null;
  }
  const line = view.state.doc.line(lineNumber);
  const lineLength = line.to - line.from;
  const clampedCol = Math.max(1, Math.min(col, lineLength + 1));
  return line.from + clampedCol - 1;
}

function createExecutionDecorations(
  lineFrom: number | null,
  executionRange: DebugExecutionRange | null,
  view?: EditorView
) {
  if (lineFrom === null) {
    return EditorView.decorations.of(Decoration.none);
  }

  const decorations = [
    Decoration.line({ attributes: { class: "cm-execution-line" } }).range(lineFrom),
  ];

  if (executionRange !== null && view !== undefined) {
    const from = getOffsetForPosition(view, executionRange.startLine, executionRange.startCol);
    const to = getOffsetForPosition(view, executionRange.endLine, executionRange.endCol);
    if (from !== null && to !== null && to > from) {
      decorations.push(
        Decoration.mark({
          attributes: { class: `cm-execution-range cm-execution-range-${executionRange.level}` },
        }).range(from, to)
      );
    }
  }

  return EditorView.decorations.of(Decoration.set(decorations, true));
}

function createExecutionGutter(lineNumber: number | null) {
  return gutter({
    class: "cm-execution-gutter",
    markers(view) {
      if (lineNumber === null || lineNumber < 1 || lineNumber > view.state.doc.lines) {
        return new RangeSetBuilder<GutterMarker>().finish();
      }
      const line = view.state.doc.line(lineNumber);
      const builder = new RangeSetBuilder<GutterMarker>();
      builder.add(line.from, line.from, executionMarker);
      return builder.finish();
    },
    initialSpacer() {
      return executionMarker;
    },
  });
}

function expandAcMainSnippet(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const cursor = selection.from;
  const line = view.state.doc.lineAt(cursor);
  const beforeCursor = view.state.sliceDoc(line.from, cursor);
  const match = beforeCursor.match(/\bacmain$/);
  if (!match) return false;

  const from = cursor - match[0].length;
  const cursorOffset = acMainSnippet.indexOf("    \n") + 4;
  view.dispatch({
    changes: { from, to: cursor, insert: acMainSnippet },
    selection: { anchor: from + cursorOffset },
  });
  return true;
}

export function createPlaygroundEditorState({
  doc,
  breakpoints,
  onToggleBreakpoint,
  onSourceChange,
}: {
  doc: string;
  breakpoints: number[];
  onToggleBreakpoint: (line: number) => void;
  onSourceChange: (nextSource: string) => void;
}) {
  return EditorState.create({
    doc,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      EditorState.tabSize.of(4),
      EditorView.clickAddsSelectionRange.of((event) => event.altKey),
      lineNumbers(),
      foldGutter(),
      highlightActiveLineGutter(),
      EditorView.lineWrapping,
      drawSelection(),
      crosshairCursor({ key: "Shift" }),
      rectangularSelection({ eventFilter: (event) => event.altKey && event.shiftKey }),
      cpp(),
      indentUnit.of("    "),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      search({ top: true }),
      highlightSelectionMatches(),
      autocompletion({
        override: [cppCompletionSource, completeAnyWord],
      }),
      keymap.of([
        { key: "Mod-f", run: openSearchPanel },
        { key: "Mod-l", run: gotoLine },
        {
          key: "Tab",
          run: (view) => {
            if (completionStatus(view.state) === "active") {
              return acceptCompletion(view);
            }
            return expandAcMainSnippet(view);
          },
        },
        indentWithTab,
        ...closeBracketsKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...defaultKeymap,
      ]),
      dracula,
      editorTheme,
      breakpointCompartment.of(createBreakpointGutter(breakpoints, onToggleBreakpoint)),
      executionCompartment.of([
        createExecutionGutter(null),
        createExecutionDecorations(null, null),
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        onSourceChange(update.state.doc.toString());
      }),
    ],
  });
}

export function reconfigureBreakpoints(
  view: EditorView,
  breakpoints: number[],
  onToggleBreakpoint: (line: number) => void
) {
  view.dispatch({
    effects: breakpointCompartment.reconfigure(
      createBreakpointGutter(breakpoints, onToggleBreakpoint)
    ),
  });
}

export function reconfigureExecution(
  view: EditorView,
  lineNumber: number | null,
  executionRange: DebugExecutionRange | null
) {
  const activeLineFrom =
    lineNumber !== null &&
    lineNumber >= 1 &&
    lineNumber <= view.state.doc.lines
      ? view.state.doc.line(lineNumber).from
      : null;

  view.dispatch({
    effects: executionCompartment.reconfigure([
      createExecutionGutter(lineNumber),
      createExecutionDecorations(activeLineFrom, executionRange, view),
    ]),
  });
}

export function syncEditorDoc(view: EditorView, source: string) {
  const currentDoc = view.state.doc.toString();
  if (currentDoc === source) return;
  view.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: source },
  });
}

export function scrollLineIntoView(view: EditorView, lineNumber: number) {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.4",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "0 0 24px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(86, 156, 214, 0.28) !important",
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(86, 156, 214, 0.34) !important",
  },
  ".cm-content ::selection": {
    backgroundColor: "rgba(86, 156, 214, 0.34)",
  },
  ".cm-selectionMatch-main": {
    backgroundColor: "rgba(220, 220, 170, 0.12)",
    outline: "1px solid rgba(220, 220, 170, 0.18)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "rgba(220, 220, 170, 0.08)",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 0",
    minWidth: "28px",
  },
  ".cm-breakpoint-gutter": {
    width: "28px",
  },
  ".cm-execution-gutter": {
    width: "14px",
  },
  ".cm-breakpoint-gutter .cm-gutterElement, .cm-execution-gutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  ".cm-breakpoint-gutter .cm-gutterElement": {
    cursor: "pointer",
  },
  ".cm-breakpoint-gutter .cm-gutterElement:hover": {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ".cm-breakpoint-marker": {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "var(--bp)",
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
  },
  ".cm-execution-marker": {
    color: "#ffdf5d",
    fontSize: "10px",
    lineHeight: "1",
    textShadow: "0 0 10px rgba(255, 223, 93, 0.45)",
  },
  ".cm-execution-line": {
    backgroundColor: "rgba(0, 160, 255, 0.22)",
  },
  ".cm-execution-range": {
    borderRadius: "2px",
  },
  ".cm-execution-range-1": {
    backgroundColor: "rgba(0, 200, 255, 0.42)",
    boxShadow: "inset 0 0 0 1px rgba(140, 235, 255, 0.35)",
  },
  ".cm-execution-range-2": {
    backgroundColor: "rgba(255, 196, 0, 0.48)",
    boxShadow: "inset 0 0 0 1px rgba(255, 232, 150, 0.45)",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-panels": {
    backgroundColor: "var(--bg3)",
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
  },
  ".cm-panel.cm-search": {
    padding: "6px 8px",
    gap: "6px",
    fontFamily: "var(--font-ui)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-gotoLineDialog input, .cm-gotoLineDialog button": {
    font: "inherit",
  },
  ".cm-textfield": {
    backgroundColor: "var(--bg2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "3px 6px",
  },
  ".cm-button": {
    backgroundColor: "var(--bg4)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "3px 8px",
  },
  ".cm-button:hover": {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(220, 220, 170, 0.24)",
    outline: "1px solid rgba(220, 220, 170, 0.35)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(79, 193, 255, 0.24)",
    outline: "1px solid rgba(79, 193, 255, 0.35)",
  },
});
