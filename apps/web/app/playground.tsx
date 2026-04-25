"use client";

import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  completeFromList,
  completionKeymap,
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
  lineNumbers,
  rectangularSelection,
  keymap,
} from "@codemirror/view";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  BugPlay,
  CirclePlay,
  RotateCcw,
  StepBack,
  StepForward,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DebugSession } from "@clientsidecpp/index";
import type { DebugExecutionRange, DebugState, ScopeView } from "@clientsidecpp/types";
import { dracula } from "thememirror";

const starterSource = `using namespace std;

int square(int x) {
    return x * x;
}

int main() {
    int n;
    cin >> n;

    vector<int> a(n);
    for (int i = 0; i < n; i++) {
        a[i] = square(i);
    }

    int total = 0;
    for (int i = 0; i < n; i++) {
        total += a[i];
    }

    cout << "n=" << n << "\\n";
    cout << "last=" << a.back() << "\\n";
    cout << "sum=" << total << "\\n";
    return 0;
}`;

const starterInput = `5`;

const initialExecution: DebugState = {
  status: "ready",
  currentLine: 1,
  callStack: [],
  output: { stdout: "", stderr: "" },
  error: null,
  localVars: [],
  globalVars: [],
  arrays: [],
  watchList: [],
  input: {
    tokens: starterInput
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
    nextIndex: 0,
  },
  executionRange: null,
  stepCount: 0,
  pauseReason: null,
};

function cloneState(state: DebugState): DebugState {
  return {
    ...state,
    output: { ...state.output },
    error: state.error ? { ...state.error } : null,
    callStack: state.callStack.map((f) => ({ ...f })),
    localVars: state.localVars.map((s) => ({
      ...s,
      vars: s.vars.map((v) => ({ ...v })),
    })),
    globalVars: state.globalVars.map((v) => ({ ...v })),
    arrays: state.arrays.map((a) => ({ ...a, values: [...a.values] })),
    watchList: state.watchList.map((w) => ({ ...w })),
    input: {
      tokens: [...state.input.tokens],
      nextIndex: state.input.nextIndex,
    },
    executionRange: state.executionRange ? { ...state.executionRange } : null,
  };
}

function getScopeTitle(scope: ScopeView, index: number): string {
  if (scope.name.startsWith("scope#")) {
    return index === 0 ? "current scope" : `outer scope ${index}`;
  }
  return scope.name;
}

function getArrayRef(value: string): number | null {
  const match = value.match(/^<(?:array|vector)#(\d+)>$/);
  return match ? Number(match[1]) : null;
}

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

const breakpointCompartment = new Compartment();
const executionCompartment = new Compartment();
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

  return EditorView.decorations.of(
    Decoration.set(decorations, true)
  );
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

function scrollLineIntoView(view: EditorView, lineNumber: number) {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

const editorTheme = EditorView.theme({
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
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(190, 255, 110, 0.34) !important",
  },
  ".cm-selectionMatch-main": {
    backgroundColor: "rgba(190, 255, 110, 0.22)",
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
    color: "var(--accent)",
    fontSize: "10px",
    lineHeight: "1",
  },
  ".cm-execution-line": {
    backgroundColor: "rgba(79, 193, 255, 0.1)",
  },
  ".cm-execution-range": {
    borderRadius: "2px",
  },
  ".cm-execution-range-1": {
    backgroundColor: "rgba(79, 193, 255, 0.18)",
  },
  ".cm-execution-range-2": {
    backgroundColor: "rgba(255, 206, 84, 0.26)",
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

export function Playground() {
  const [source, setSource] = useState(starterSource);
  const [input, setInput] = useState(starterInput);
  const [execution, setExecution] = useState<DebugState>(initialExecution);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<"stdout" | "stderr">("stdout");
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef<DebugSession | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const arraysByRef = useMemo(
    () => new Map(execution.arrays.map((arr) => [arr.ref, arr])),
    [execution.arrays]
  );
  const hasSession = sessionRef.current !== null;
  const canStep =
    hasSession &&
    execution.status !== "done" &&
    execution.status !== "error";

  const syncBreakpointState = (
    session: DebugSession | null,
    next: number[]
  ) => {
    if (!session) return;
    for (const l of session.listBreakpoints()) session.removeBreakpoint(l);
    for (const l of next) session.setBreakpoint(l);
  };

  const resetExecution = () => {
    sessionRef.current = null;
    setExecution(cloneState(initialExecution));
  };

  const withFreshSession = (): DebugSession => {
    const s = new DebugSession(source, input);
    syncBreakpointState(s, breakpoints);
    sessionRef.current = s;
    return s;
  };

  const applyState = (state: DebugState) => {
    setExecution(cloneState(state));
    setIsDirty(false);
  };

  const runAction = (
    action: (s: DebugSession) => DebugState,
    opts: { restart?: boolean } = {}
  ) => {
    startTransition(() => {
      const s =
        opts.restart || !sessionRef.current
          ? withFreshSession()
          : sessionRef.current;
      applyState(action(s));
    });
  };

  const handleLaunch = () => runAction((s) => s.stepInto(), { restart: true });
  const handleRestart = () => runAction((s) => s.stepInto(), { restart: true });
  const handleContinue = () => runAction((s) => s.run(), { restart: isDirty });
  const handleStepInto = () => runAction((s) => s.stepInto(), { restart: isDirty });
  const handleStepOver = () => runAction((s) => s.stepOver(), { restart: isDirty });
  const handleStepOut = () => runAction((s) => s.stepOut(), { restart: isDirty });

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((cur) => {
      const next = cur.includes(line)
        ? cur.filter((v) => v !== line)
        : [...cur, line].sort((a, b) => a - b);
      syncBreakpointState(sessionRef.current, next);
      return next;
    });
  };

  useEffect(() => {
    if (!editorHostRef.current) return;

    const onToggleBreakpoint = (line: number) => {
      toggleBreakpoint(line);
    };

    const state = EditorState.create({
      doc: source,
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
          { key: "Tab", run: acceptCompletion },
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
          const nextSource = update.state.doc.toString();
          setSource(nextSource);
          setIsDirty(true);
          resetExecution();
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorHostRef.current,
    });

    editorViewRef.current = view;
    return () => {
      editorViewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: breakpointCompartment.reconfigure(
        createBreakpointGutter(breakpoints, toggleBreakpoint)
      ),
    });
  }, [breakpoints]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const activeLine =
      execution.status === "paused" ||
      execution.status === "done" ||
      execution.status === "error"
        ? execution.currentLine
        : null;
    const activeLineFrom =
      activeLine !== null &&
      activeLine >= 1 &&
      activeLine <= view.state.doc.lines
        ? view.state.doc.line(activeLine).from
        : null;

    view.dispatch({
      effects: executionCompartment.reconfigure([
        createExecutionGutter(activeLine),
        createExecutionDecorations(activeLineFrom, execution.executionRange, view),
      ]),
    });

    if (activeLine !== null) {
      scrollLineIntoView(view, activeLine);
    }
  }, [execution.currentLine, execution.executionRange, execution.status]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === source) return;
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: source },
    });
  }, [source]);

  const st = execution.status;
  const renderVarRow = (v: { name: string; kind: string; value: string }, scopeKey: string) => {
    const arrayRef = v.kind === "array" ? getArrayRef(v.value) : null;
    const arrayView = arrayRef === null ? null : arraysByRef.get(arrayRef);

    return (
      <div key={`${scopeKey}-${v.name}`} className="var-block">
        <div className="var-row">
          <span className="var-name">{v.name}</span>
          <span className="var-type">
            {arrayView ? (arrayView.dynamic ? "vector" : "array") : v.kind}
          </span>
          <span className={`var-val${arrayView ? " array-ref" : ""}`}>
            {arrayView ? `[${arrayView.values.join(", ")}]` : v.value}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="ide">
      <aside className="left">
        <div className="toolbar">
          <button
            className="tb-btn primary"
            title="Launch Debugger"
            onClick={handleLaunch}
            disabled={isPending}
          >
            <BugPlay size={14} strokeWidth={2} />
          </button>
          <button
            className="tb-btn run"
            title={execution.status === "paused" ? "Continue" : "Run to End"}
            onClick={handleContinue}
            disabled={isPending}
          >
            <CirclePlay size={14} strokeWidth={2} />
          </button>
          <button
            className="tb-btn danger"
            title="Restart"
            onClick={handleRestart}
            disabled={isPending}
          >
            <RotateCcw size={14} strokeWidth={2} />
          </button>
          <div className="sep" />
          <button
            className="tb-btn"
            title="Step Into"
            onClick={handleStepInto}
            disabled={!canStep || isPending}
          >
            <ArrowDownToLine size={14} strokeWidth={2} />
          </button>
          <button
            className="tb-btn"
            title="Step Over"
            onClick={handleStepOver}
            disabled={!canStep || isPending}
          >
            <StepForward size={14} strokeWidth={2} />
          </button>
          <button
            className="tb-btn"
            title="Step Out"
            onClick={handleStepOut}
            disabled={!canStep || isPending}
          >
            <StepBack size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="status-row">
          <div className={`status-dot ${st}`} />
          <span className={`status-label ${st}`}>{st}</span>
          <span className="status-meta">
            L{execution.currentLine}
            {" · "}
            {execution.stepCount}steps
            {execution.pauseReason ? ` · ${execution.pauseReason}` : ""}
            {breakpoints.length > 0 ? ` · ${breakpoints.length}bp` : ""}
          </span>
        </div>

        {isDirty && (
          <div className="dirty-notice">
            <AlertCircle size={12} strokeWidth={2} />
            <span>Source changed - next action will restart</span>
          </div>
        )}

        <div className="debug-scroll">
          <div className="dbg-section">
            <div className="dbg-header">
              Input
              <span className="count">
                {execution.input.nextIndex}/{execution.input.tokens.length}
              </span>
            </div>
            {execution.input.tokens.length === 0 ? (
              <div className="empty-row">No stdin tokens</div>
            ) : (
              <div className="runtime-input-wrap">
                {execution.input.tokens.slice(execution.input.nextIndex).join(" ")}
              </div>
            )}
          </div>

          <div className="dbg-section">
            <div className="dbg-header">
              Call Stack
              <span className="count">{execution.callStack.length}</span>
            </div>
            {execution.callStack.length === 0 ? (
              <div className="empty-row">No active frames</div>
            ) : (
              <ul className="stack-list">
                {[...execution.callStack].reverse().map((frame, i) => (
                  <li
                    key={`${frame.functionName}-${frame.line}-${i}`}
                    className={`stack-item${i === 0 ? " top" : ""}`}
                  >
                    <span className="stack-fn">{frame.functionName}()</span>
                    <span className="stack-line">:{frame.line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dbg-section">
            <div className="dbg-header">
              Variables
              <span className="count">
                {execution.localVars.reduce((n, s) => n + s.vars.length, 0)}
              </span>
            </div>
            {execution.localVars.length === 0 ? (
              <div className="empty-row">No local variables</div>
            ) : (
              execution.localVars.map((scope, idx) => (
                <div key={`${scope.name}-${idx}`} className="var-scope">
                  <div className="scope-name">{getScopeTitle(scope, idx)}</div>
                  {scope.vars.map((v) => renderVarRow(v, scope.name))}
                </div>
              ))
            )}
          </div>

          {execution.globalVars.length > 0 && (
            <div className="dbg-section">
              <div className="dbg-header">
                Globals
                <span className="count">{execution.globalVars.length}</span>
              </div>
              <div className="var-scope">
                {execution.globalVars.map((v) => renderVarRow(v, "global"))}
              </div>
            </div>
          )}

          {execution.error && (
            <div className="dbg-section">
              <div className="dbg-header" style={{ color: "var(--red)" }}>
                Error
              </div>
              <div className="error-msg">{execution.error.message}</div>
            </div>
          )}
        </div>
      </aside>

      <div className="right">
        <div className="editor-area">
          <div ref={editorHostRef} className="code-editor" />
        </div>

        <div className="io-area">
          <div className="io-pane">
            <div className="io-header">
              <ArrowRight size={12} strokeWidth={2} className="io-icon" />stdin
            </div>
            <div className="io-body">
              <textarea
                spellCheck={false}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setIsDirty(true);
                  resetExecution();
                }}
                placeholder="stdin..."
              />
            </div>
          </div>

          <div className="io-pane output-pane">
            <div className="io-header">
              <div className="io-tabs">
                <button
                  type="button"
                  className={`io-tab${activeOutputTab === "stdout" ? " active" : ""}`}
                  onClick={() => setActiveOutputTab("stdout")}
                >
                  <ArrowLeft size={12} strokeWidth={2} className="io-icon" />stdout
                </button>
                <button
                  type="button"
                  className={`io-tab${activeOutputTab === "stderr" ? " active" : ""}`}
                  onClick={() => setActiveOutputTab("stderr")}
                >
                  <AlertCircle size={12} strokeWidth={2} className="io-icon io-icon-err" />stderr
                </button>
              </div>
            </div>
            <div className="io-body">
              {activeOutputTab === "stdout" ? (
                execution.output.stdout ? (
                  <pre>{execution.output.stdout}</pre>
                ) : (
                  <span className="empty">empty</span>
                )
              ) : execution.output.stderr ? (
                <pre className="err">{execution.output.stderr}</pre>
              ) : (
                <span className="empty">empty</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
