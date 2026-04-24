"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DebugSession } from "@clientsidecpp/index";
import type { ArrayView, DebugState, ScopeView } from "@clientsidecpp/types";

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

function getArrayLabel(a: ArrayView): string {
  return a.dynamic ? `vector#${a.ref}` : `array#${a.ref}`;
}

function getScopeTitle(scope: ScopeView, index: number): string {
  if (scope.name.startsWith("scope#")) {
    return index === 0 ? "current scope" : `outer scope ${index}`;
  }
  return scope.name;
}

// ── Icon primitives ──────────────────────────────────────────────────────────
const I = {
  // codicon-style SVG paths (16×16 viewBox)
  Launch: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.5l7 4.5-7 4.5V3.5z"/>
    </svg>
  ),
  Continue: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3.5l5 4.5-5 4.5V3.5zm6 0h1.5v9H10V3.5z"/>
    </svg>
  ),
  Restart: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 1 1 .908-.416A6 6 0 1 1 8 2v1z"/>
      <path d="M8 2l2 2-2 2V2z"/>
    </svg>
  ),
  StepInto: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1v8M5 6l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" fill="none"/>
    </svg>
  ),
  StepOver: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4a4 4 0 0 1 8 0v5M9 6l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none"/>
    </svg>
  ),
  StepOut: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15V7M5 10l3-3 3 3M3 3h10" stroke="currentColor" strokeWidth="1.4" fill="none"/>
    </svg>
  ),
};

export function Playground() {
  const [source, setSource] = useState(starterSource);
  const [input, setInput] = useState(starterInput);
  const [execution, setExecution] = useState<DebugState>(initialExecution);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef<DebugSession | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterInnerRef = useRef<HTMLDivElement | null>(null);

  const sourceLines = useMemo(() => source.split("\n"), [source]);
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

  const handleLaunch    = () => runAction((s) => s.stepInto(), { restart: true });
  const handleRestart   = () => runAction((s) => s.stepInto(), { restart: true });
  const handleContinue  = () => runAction((s) => s.run(),      { restart: isDirty });
  const handleStepInto  = () => runAction((s) => s.stepInto(), { restart: isDirty });
  const handleStepOver  = () => runAction((s) => s.stepOver(), { restart: isDirty });
  const handleStepOut   = () => runAction((s) => s.stepOut(),  { restart: isDirty });

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((cur) => {
      const next = cur.includes(line)
        ? cur.filter((v) => v !== line)
        : [...cur, line].sort((a, b) => a - b);
      syncBreakpointState(sessionRef.current, next);
      return next;
    });
  };

  // Sync gutter scroll with editor scroll
  useEffect(() => {
    const editor = editorRef.current;
    const gutterInner = gutterInnerRef.current;
    if (!editor || !gutterInner) return;
    const sync = () => { gutterInner.scrollTop = editor.scrollTop; };
    sync();
    editor.addEventListener("scroll", sync);
    return () => editor.removeEventListener("scroll", sync);
  }, []);

  const st = execution.status;

  return (
    <div className="ide">
      {/* ── LEFT PANEL ── */}
      <aside className="left">
        {/* Toolbar */}
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

        {/* Status row */}
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
            ⚠ Source changed — next action will restart
          </div>
        )}

        {/* Debug sections */}
        <div className="debug-scroll">
          {/* Call Stack */}
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

          {/* Local Variables */}
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
                  {scope.vars.map((v) => (
                    <div
                      key={`${scope.name}-${v.name}`}
                      className="var-row"
                    >
                      <span className="var-name">{v.name}</span>
                      <span className="var-type">{v.kind}</span>
                      <span
                        className={`var-val${v.kind === "ARRAY" ? " array-ref" : ""}`}
                      >
                        {v.value}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Global Variables */}
          {execution.globalVars.length > 0 && (
            <div className="dbg-section">
              <div className="dbg-header">
                Globals
                <span className="count">{execution.globalVars.length}</span>
              </div>
              <div className="var-scope">
                {execution.globalVars.map((v) => (
                  <div key={v.name} className="var-row">
                    <span className="var-name">{v.name}</span>
                    <span className="var-type">{v.kind}</span>
                    <span className="var-val">{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Arrays / Vectors */}
          <div className="dbg-section">
            <div className="dbg-header">
              Arrays / Vectors
              <span className="count">{execution.arrays.length}</span>
            </div>
            {execution.arrays.length === 0 ? (
              <div className="empty-row">No arrays in memory</div>
            ) : (
              execution.arrays.map((arr) => (
                <div key={arr.ref} className="array-item">
                  <div className="array-hdr">
                    {getArrayLabel(arr)}
                    <span className="array-type-badge">{arr.elementType}</span>
                  </div>
                  <div className="array-vals">[{arr.values.join(", ")}]</div>
                </div>
              ))
            )}
          </div>

          {/* Error */}
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

      {/* ── RIGHT PANEL ── */}
      <div className="right">
        {/* Editor */}
        <div className="editor-area">
          <div className="gutter">
            <div ref={gutterInnerRef} className="gutter-inner">
              {sourceLines.map((_, i) => {
                const line = i + 1;
                const isCur = execution.currentLine === line;
                const hasBp = breakpoints.includes(line);
                return (
                  <button
                    key={line}
                    type="button"
                    className={`gutter-line${isCur ? " cur" : ""}${hasBp ? " bp" : ""}`}
                    onClick={() => toggleBreakpoint(line)}
                    title={`Toggle breakpoint on line ${line}`}
                  >
                    <span className="bp-dot" />
                    <span>{line}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="source-wrap">
            <textarea
              ref={editorRef}
              className="source-editor"
              spellCheck={false}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setIsDirty(true);
                resetExecution();
              }}
              placeholder="Write your C++ code here..."
            />
          </div>
        </div>

        {/* I/O */}
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

          <div className="io-pane">
            <div className="io-header">
              <span className="io-icon">←</span>stdout
            </div>
            <div className="io-body">
              {execution.output.stdout ? (
                <pre>{execution.output.stdout}</pre>
              ) : (
                <span className="empty">empty</span>
              )}
            </div>
          </div>

          <div className="io-pane">
            <div className="io-header">
              <span className="io-icon" style={{ color: "var(--red)" }}>!</span>stderr
            </div>
            <div className="io-body">
              {execution.output.stderr ? (
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