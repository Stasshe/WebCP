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

  const handleStart = () => {
    runAction((session) => session.stepInto(), { restart: true });
  };

  const handleRestart = () => {
    runAction((session) => session.stepInto(), { restart: true });
  };

  const handleRun = () => {
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
      <aside className="sidebar">
        <section className="tool-panel">
          <div className="panel-title-row">
            <div>
              <p className="panel-kicker">Debugger</p>
              <h1>ClientSideCPP</h1>
            </div>
            <span className={`status-pill status-${execution.status}`}>{execution.status}</span>
          </div>

          <div className="toolbar">
            <button type="button" onClick={handleStart} disabled={isPending}>
              Start
            </button>
            <button type="button" onClick={handleRun} disabled={isPending}>
              {execution.status === "paused" ? "Continue" : "Run"}
            </button>
            <button type="button" onClick={handleRestart} disabled={isPending}>
              Restart
            </button>
          </div>

          <div className="toolbar compact">
            <button type="button" onClick={handleStepInto} disabled={!canStep || isPending}>
              Step Into
            </button>
            <button type="button" onClick={handleStepOver} disabled={!canStep || isPending}>
              Step Over
            </button>
            <button type="button" onClick={handleStepOut} disabled={!canStep || isPending}>
              Step Out
            </button>
          </div>

          <dl className="summary-grid">
            <div>
              <dt>Line</dt>
              <dd>{execution.currentLine}</dd>
            </div>
            <div>
              <dt>Pause</dt>
              <dd>{execution.pauseReason ?? "-"}</dd>
            </div>
            <div>
              <dt>Steps</dt>
              <dd>{execution.stepCount}</dd>
            </div>
            <div>
              <dt>BPs</dt>
              <dd>{breakpoints.length}</dd>
            </div>
          </dl>

          {isDirty ? <p className="notice">Source/Input changed. Next action restarts the session.</p> : null}
          {execution.error ? (
            <pre className="output-panel error-panel">{execution.error.message}</pre>
          ) : null}
        </section>

        <section className="tool-panel fill-panel">
          <div className="panel-heading">
            <h2>Input</h2>
          </div>
          <textarea
            className="input-editor"
            spellCheck={false}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setIsDirty(true);
              resetExecution();
            }}
          />
        </section>

        <section className="tool-panel fill-panel">
          <div className="panel-heading">
            <h2>Call Stack</h2>
          </div>
          <div className="panel-scroll">
            <ul className="item-list">
              {execution.callStack.length === 0 ? (
                <li className="muted">No active frames</li>
              ) : (
                execution.callStack
                  .slice()
                  .reverse()
                  .map((frame, index) => (
                    <li key={`${frame.functionName}-${frame.line}-${index}`} className="stack-item">
                      <strong>{frame.functionName}()</strong>
                      <span>line {frame.line}</span>
                    </li>
                  ))
              )}
            </ul>
          </div>
        </section>

        <section className="tool-panel fill-panel">
          <div className="panel-heading">
            <h2>Variables</h2>
          </div>
          <div className="panel-scroll debug-sections">
            <div className="debug-group">
              <h3>Locals</h3>
              {execution.localVars.length === 0 ? (
                <p className="muted">No locals</p>
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
                            <code>{variable.value}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="debug-group">
              <h3>Globals</h3>
              {execution.globalVars.length === 0 ? (
                <p className="muted">No globals</p>
              ) : (
                <ul className="item-list">
                  {execution.globalVars.map((variable) => (
                    <li key={variable.name} className="var-item">
                      <span className="var-name">{variable.name}</span>
                      <span className="var-kind">{variable.kind}</span>
                      <code>{variable.value}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="debug-group">
              <h3>Arrays / Vectors</h3>
              {execution.arrays.length === 0 ? (
                <p className="muted">No arrays</p>
              ) : (
                execution.arrays.map((array) => (
                  <div key={array.ref} className="scope-card">
                    <div className="scope-header">
                      {getArrayLabel(array)} <span>{array.elementType}</span>
                    </div>
                    <code className="array-view">[{array.values.join(", ")}]</code>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="tool-panel fill-panel">
          <div className="panel-heading">
            <h2>Output</h2>
          </div>
          <div className="panel-scroll output-stack">
            <div>
              <h3>stdout</h3>
              <pre className="output-panel">{execution.output.stdout || "(empty)"}</pre>
            </div>
            <div>
              <h3>stderr</h3>
              <pre className="output-panel">{execution.output.stderr || "(empty)"}</pre>
            </div>
          </div>
        </section>
      </aside>

      <section className="editor-panel">
        <div className="editor-topbar">
          <div className="editor-meta">
            <span>playground.cpp</span>
            <span>Current line: {execution.currentLine}</span>
          </div>
          <div className="editor-meta">
            <span>{sourceLines.length} lines</span>
            <span>{breakpoints.length > 0 ? `Breakpoints: ${breakpoints.join(", ")}` : "No breakpoints"}</span>
          </div>
        </div>

        <div className="editor-shell">
          <div ref={gutterRef} className="editor-gutter" aria-hidden="true">
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
                >
                  <span className="breakpoint-dot" />
                  <span>{lineNumberLabel(line)}</span>
                </button>
              );
            })}
          </div>

          <textarea
            ref={editorRef}
            className="source-editor"
            spellCheck={false}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setIsDirty(true);
              resetExecution();
            }}
          />
        </div>
      </section>
    </main>
  );
}
