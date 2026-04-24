"use client";

import { cpp } from "@codemirror/lang-cpp";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DebugSession } from "@clientsidecpp/index";
import type { DebugState, ScopeView } from "@clientsidecpp/types";

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

function createExecutionDecorations(lineFrom: number | null) {
  if (lineFrom === null) {
    return EditorView.decorations.of(Decoration.none);
  }

  return EditorView.decorations.of(
    Decoration.set([
      Decoration.line({ attributes: { class: "cm-execution-line" } }).range(lineFrom),
    ], true)
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
    backgroundColor: "var(--bg)",
    color: "var(--text)",
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
    caretColor: "var(--text-bright)",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--text-bright)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(79, 193, 255, 0.22)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg2)",
    color: "var(--text-dim)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 0",
    minWidth: "28px",
  },
  ".cm-breakpoint-gutter": {
    width: "20px",
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
  ".cm-focused": {
    outline: "none",
  },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--bg3)",
  },
});

// ── Icon primitives ──────────────────────────────────────────────────────────
const I = {
  Launch: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.5l7 4.5-7 4.5V3.5z" />
    </svg>
  ),
  Continue: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3.5l5 4.5-5 4.5V3.5zm6 0h1.5v9H10V3.5z" />
    </svg>
  ),
  Restart: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 1 1 .908-.416A6 6 0 1 1 8 2v1z" />
      <path d="M8 2l2 2-2 2V2z" />
    </svg>
  ),
  StepInto: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1v8M5 6l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  ),
  StepOver: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4a4 4 0 0 1 8 0v5M9 6l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  ),
  StepOut: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15V7M5 10l3-3 3 3M3 3h10" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  ),
};

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
        lineNumbers(),
        highlightActiveLineGutter(),
        EditorView.lineWrapping,
        cpp(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        editorTheme,
        breakpointCompartment.of(createBreakpointGutter(breakpoints, onToggleBreakpoint)),
        executionCompartment.of([
          createExecutionGutter(null),
          createExecutionDecorations(null),
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
        createExecutionDecorations(activeLineFrom),
      ]),
    });

    if (activeLine !== null) {
      scrollLineIntoView(view, activeLine);
    }
  }, [execution.currentLine, execution.status]);

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
            <I.Launch />
          </button>
          <button
            className="tb-btn run"
            title={execution.status === "paused" ? "Continue" : "Run to End"}
            onClick={handleContinue}
            disabled={isPending}
          >
            <I.Continue />
          </button>
          <button
            className="tb-btn danger"
            title="Restart"
            onClick={handleRestart}
            disabled={isPending}
          >
            <I.Restart />
          </button>
          <div className="sep" />
          <button
            className="tb-btn"
            title="Step Into"
            onClick={handleStepInto}
            disabled={!canStep || isPending}
          >
            <I.StepInto />
          </button>
          <button
            className="tb-btn"
            title="Step Over"
            onClick={handleStepOver}
            disabled={!canStep || isPending}
          >
            <I.StepOver />
          </button>
          <button
            className="tb-btn"
            title="Step Out"
            onClick={handleStepOut}
            disabled={!canStep || isPending}
          >
            <I.StepOut />
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
            ⚠ Source changed - next action will restart
          </div>
        )}

        <div className="debug-scroll">
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
              <span className="io-icon">→</span>stdin
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
                  <span className="io-icon">←</span>stdout
                </button>
                <button
                  type="button"
                  className={`io-tab${activeOutputTab === "stderr" ? " active" : ""}`}
                  onClick={() => setActiveOutputTab("stderr")}
                >
                  <span className="io-icon" style={{ color: "var(--red)" }}>!</span>stderr
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
