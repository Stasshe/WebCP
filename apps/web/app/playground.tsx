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
    callStack: state.callStack.map((frame) => ({ ...frame })),
    localVars: state.localVars.map((scope) => ({
      ...scope,
      vars: scope.vars.map((variable) => ({ ...variable })),
    })),
    globalVars: state.globalVars.map((variable) => ({ ...variable })),
    arrays: state.arrays.map((array) => ({
      ...array,
      values: [...array.values],
    })),
    watchList: state.watchList.map((watch) => ({ ...watch })),
  };
}

function lineNumberLabel(line: number): string {
  return line.toString().padStart(2, "0");
}

function getArrayLabel(array: ArrayView): string {
  return array.dynamic ? `vector#${array.ref}` : `array#${array.ref}`;
}

function getScopeTitle(scope: ScopeView, index: number): string {
  if (scope.name.startsWith("scope#")) {
    return index === 0 ? "Current scope" : `Outer scope ${index}`;
  }
  return scope.name;
}

export function Playground() {
  const [source, setSource] = useState(starterSource);
  const [input, setInput] = useState(starterInput);
  const [execution, setExecution] = useState<DebugState>(initialExecution);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef<DebugSession | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const sourceLines = useMemo(() => source.split("\n"), [source]);
  const hasSession = sessionRef.current !== null;
  const canStep = hasSession && execution.status !== "done" && execution.status !== "error";

  const syncBreakpointState = (session: DebugSession | null, nextBreakpoints: number[]) => {
    if (session === null) {
      return;
    }
    for (const line of session.listBreakpoints()) {
      session.removeBreakpoint(line);
    }
    for (const line of nextBreakpoints) {
      session.setBreakpoint(line);
    }
  };

  const resetExecution = () => {
    sessionRef.current = null;
    setExecution(cloneState(initialExecution));
  };

  const withFreshSession = (): DebugSession => {
    const session = new DebugSession(source, input);
    syncBreakpointState(session, breakpoints);
    sessionRef.current = session;
    return session;
  };

  const applyState = (state: DebugState) => {
    setExecution(cloneState(state));
    setIsDirty(false);
  };

  const runAction = (
    action: (session: DebugSession) => DebugState,
    options: { restart?: boolean } = {},
  ) => {
    startTransition(() => {
      const session =
        options.restart || sessionRef.current === null ? withFreshSession() : sessionRef.current;
      const nextState = action(session);
      applyState(nextState);
    });
  };

  const handleLaunchAndBreak = () => {
    runAction((session) => session.stepInto(), { restart: true });
  };

  const handleRestart = () => {
    runAction((session) => session.stepInto(), { restart: true });
  };

  const handleRunToEnd = () => {
    runAction((session) => session.run(), { restart: isDirty });
  };

  const handleStepInto = () => {
    runAction((session) => session.stepInto(), { restart: isDirty });
  };

  const handleStepOver = () => {
    runAction((session) => session.stepOver(), { restart: isDirty });
  };

  const handleStepOut = () => {
    runAction((session) => session.stepOut(), { restart: isDirty });
  };

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((current) => {
      const next = current.includes(line)
        ? current.filter((value) => value !== line)
        : [...current, line].sort((left, right) => left - right);
      syncBreakpointState(sessionRef.current, next);
      return next;
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    const gutter = gutterRef.current;
    if (editor === null || gutter === null) {
      return;
    }

    const syncScroll = () => {
      gutter.scrollTop = editor.scrollTop;
    };

    syncScroll();
    editor.addEventListener("scroll", syncScroll);
    return () => editor.removeEventListener("scroll", syncScroll);
  }, []);

  return (
    <main className="ide-shell">
      <aside className="sidebar left-panel">
        <section className="tool-panel">
          <div className="panel-title-row">
            <div>
              <p className="panel-kicker">Left Panel</p>
              <h1>Debugger & Status</h1>
            </div>
            <span className={`status-pill status-${execution.status}`}>{execution.status}</span>
          </div>

          <div className="control-card">
            <h2 className="section-title">Execution Controls</h2>
            <div className="toolbar">
              <button type="button" className="btn-primary" onClick={handleLaunchAndBreak} disabled={isPending}>
                Launch Debugger
              </button>
              <button type="button" className="btn-success" onClick={handleRunToEnd} disabled={isPending}>
                {execution.status === "paused" ? "Continue To End" : "Run All"}
              </button>
              <button type="button" className="btn-danger" onClick={handleRestart} disabled={isPending}>
                Restart
              </button>
            </div>

            <div className="toolbar compact mt-2">
              <button type="button" onClick={handleStepInto} disabled={!canStep || isPending}>
                Step Into(↓)
              </button>
              <button type="button" onClick={handleStepOver} disabled={!canStep || isPending}>
                Step Over(→)
              </button>
              <button type="button" onClick={handleStepOut} disabled={!canStep || isPending}>
                Step Out(↑)
              </button>
            </div>
          </div>

          <dl className="summary-grid">
            <div className="grid-item">
              <dt>Line</dt>
              <dd>{execution.currentLine}</dd>
            </div>
            <div className="grid-item">
              <dt>Pause Reason</dt>
              <dd>{execution.pauseReason ?? "-"}</dd>
            </div>
            <div className="grid-item">
              <dt>Steps Took</dt>
              <dd>{execution.stepCount}</dd>
            </div>
            <div className="grid-item">
              <dt>BPs</dt>
              <dd>{breakpoints.length}</dd>
            </div>
          </dl>

          {isDirty ? <p className="notice">⚠️ Source code or input has changed. Proceeding will restart the session.</p> : null}
          {execution.error ? (
            <pre className="output-panel error-panel p-2 mt-2">{execution.error.message}</pre>
          ) : null}
        </section>

        <section className="tool-panel fill-panel state-view-area">
          <div className="panel-heading">
            <h2 className="section-title">System State (Scrollable)</h2>
          </div>
          <div className="panel-scroll scrollable-container">
            <div className="debug-group">
              <h3>Call Stack</h3>
              <ul className="item-list">
                {execution.callStack.length === 0 ? (
                  <li className="muted p-2 rounded bg-panel-soft">No active frames</li>
                ) : (
                  execution.callStack
                    .slice()
                    .reverse()
                    .map((frame, index) => (
                      <li key={`${frame.functionName}-${frame.line}-${index}`} className="stack-item">
                        <strong>{frame.functionName}()</strong>
                        <span className="badge">line {frame.line}</span>
                      </li>
                    ))
                )}
              </ul>
            </div>

            <div className="debug-group">
              <h3>Local Variables</h3>
              {execution.localVars.length === 0 ? (
                <p className="muted p-2 rounded bg-panel-soft">No local variables</p>
              ) : (
                execution.localVars.map((scope, index) => (
                  <div key={`${scope.name}-${index}`} className="scope-card">
                    <div className="scope-header">{getScopeTitle(scope, index)}</div>
                    {scope.vars.length === 0 ? (
                      <p className="muted">Empty</p>
                    ) : (
                      <ul className="item-list">
                        {scope.vars.map((variable) => (
                          <li key={`${scope.name}-${variable.name}`} className="var-item">
                            <span className="var-name">{variable.name}</span>
                            <span className="var-kind">{variable.kind}</span>
                            <code className="var-value">{variable.value}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="debug-group">
              <h3>Global Variables</h3>
              {execution.globalVars.length === 0 ? (
                <p className="muted p-2 rounded bg-panel-soft">No globals</p>
              ) : (
                <ul className="item-list">
                  {execution.globalVars.map((variable) => (
                    <li key={variable.name} className="var-item">
                      <span className="var-name">{variable.name}</span>
                      <span className="var-kind">{variable.kind}</span>
                      <code className="var-value">{variable.value}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="debug-group">
              <h3>Arrays / Vectors</h3>
              {execution.arrays.length === 0 ? (
                <p className="muted p-2 rounded bg-panel-soft">No arrays in memory</p>
              ) : (
                execution.arrays.map((array) => (
                  <div key={array.ref} className="scope-card">
                    <div className="scope-header">
                      {getArrayLabel(array)} <span className="badge">{array.elementType}</span>
                    </div>
                    <code className="array-view">[{array.values.join(", ")}]</code>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

      </aside>

      <section className="editor-panel right-panel">
        <div className="editor-topbar">
          <div>
            <p className="panel-kicker">Right Panel</p>
            <h1 className="panel-title">Editor & I/O</h1>
          </div>
        </div>

        <div className="editor-container">
          <div className="editor-meta-bar">
            <span className="badge">playground.cpp</span>
            <span className="badge">Current Line: {execution.currentLine}</span>
            <span className="badge muted">Total {sourceLines.length} lines</span>
          </div>
          
          <div className="editor-shell editable-area">
            <div ref={gutterRef} className="editor-gutter scrollable-container" aria-hidden="true" title="Click line number to toggle breakpoint">
              {sourceLines.map((_, index) => {
                const line = index + 1;
                const isCurrent = execution.currentLine === line;
                const hasBreakpoint = breakpoints.includes(line);
                return (
                  <button
                    key={line}
                    type="button"
                    className={`gutter-line${isCurrent ? " current" : ""}${hasBreakpoint ? " breakpoint" : ""}`}
                    onClick={() => toggleBreakpoint(line)}
                    title={`Toggle Breakpoint on line ${line}`}
                  >
                    <span className="breakpoint-dot" />
                    <span>{lineNumberLabel(line)}</span>
                  </button>
                );
              })}
            </div>

            <textarea
              ref={editorRef}
              className="source-editor scrollable-container"
              spellCheck={false}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setIsDirty(true);
                resetExecution();
              }}
              placeholder="Write your C++ code here..."
            />
          </div>
        </div>

        <div className="io-panel">
          <div className="io-section inable">
            <div className="panel-heading">
              <h2 className="section-title">Standard Input (Editable)</h2>
            </div>
            <textarea
              className="input-editor editable-area scrollable-container"
              spellCheck={false}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setIsDirty(true);
                resetExecution();
              }}
              placeholder="Enter standard input here..."
            />
          </div>

          <div className="io-section">
            <div className="panel-heading">
              <h2 className="section-title">Standard Output (Read-only scrollable)</h2>
            </div>
            <pre className="output-panel scrollable-container stdout-panel">
              {execution.output.stdout || "(empty)"}
            </pre>
          </div>
          
          <div className="io-section">
            <div className="panel-heading">
              <h2 className="section-title">Standard Error (Read-only scrollable)</h2>
            </div>
            <pre className="output-panel scrollable-container stderr-panel">
              {execution.output.stderr || "(empty)"}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}