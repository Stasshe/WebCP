import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BugPlay,
  CirclePlay,
  RotateCcw,
  StepBack,
  StepForward,
} from "lucide-react";
import type { DebugState } from "@clientsidecpp/types";
import { getArrayRef, getScopeTitle } from "./playground-state";

export function DebugSidebar({
  execution,
  breakpoints,
  isDirty,
  isPending,
  canStep,
  arraysByRef,
  onLaunch,
  onContinue,
  onRestart,
  onStepInto,
  onStepOver,
  onStepOut,
}: {
  execution: DebugState;
  breakpoints: number[];
  isDirty: boolean;
  isPending: boolean;
  canStep: boolean;
  arraysByRef: Map<number, { dynamic: boolean; values: string[] }>;
  onLaunch: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onStepInto: () => void;
  onStepOver: () => void;
  onStepOut: () => void;
}) {
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
    <aside className="left">
      <div className="toolbar">
        <button className="tb-btn primary" title="Launch Debugger" onClick={onLaunch} disabled={isPending}>
          <BugPlay size={14} strokeWidth={2} />
        </button>
        <button
          className="tb-btn run"
          title={execution.status === "paused" ? "Continue" : "Run to End"}
          onClick={onContinue}
          disabled={isPending}
        >
          <CirclePlay size={14} strokeWidth={2} />
        </button>
        <button className="tb-btn danger" title="Restart" onClick={onRestart} disabled={isPending}>
          <RotateCcw size={14} strokeWidth={2} />
        </button>
        <div className="sep" />
        <button className="tb-btn" title="Step Into" onClick={onStepInto} disabled={!canStep || isPending}>
          <ArrowDownToLine size={14} strokeWidth={2} />
        </button>
        <button className="tb-btn" title="Step Over" onClick={onStepOver} disabled={!canStep || isPending}>
          <StepForward size={14} strokeWidth={2} />
        </button>
        <button className="tb-btn" title="Step Out" onClick={onStepOut} disabled={!canStep || isPending}>
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
  );
}

export function IOPanels({
  input,
  activeOutputTab,
  execution,
  onInputChange,
  onOutputTabChange,
}: {
  input: string;
  activeOutputTab: "stdout" | "stderr";
  execution: DebugState;
  onInputChange: (nextInput: string) => void;
  onOutputTabChange: (tab: "stdout" | "stderr") => void;
}) {
  return (
    <div className="io-area">
      <div className="io-pane">
        <div className="io-header">
          <ArrowRight size={12} strokeWidth={2} className="io-icon" />
          stdin
        </div>
        <div className="io-body">
          <textarea
            spellCheck={false}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
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
              onClick={() => onOutputTabChange("stdout")}
            >
              <ArrowLeft size={12} strokeWidth={2} className="io-icon" />
              stdout
            </button>
            <button
              type="button"
              className={`io-tab${activeOutputTab === "stderr" ? " active" : ""}`}
              onClick={() => onOutputTabChange("stderr")}
            >
              <AlertCircle size={12} strokeWidth={2} className="io-icon io-icon-err" />
              stderr
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
  );
}
