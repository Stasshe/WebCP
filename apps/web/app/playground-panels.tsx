import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BugPlay,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  RotateCcw,
  StepBack,
  StepForward,
} from "lucide-react";
import { useState } from "react";
import type { DebugState } from "@/types";
import { getArrayRef, getScopeTitle } from "./playground-state";

const COLLAPSE_THRESHOLD = 6;

function ArrayElementRow({
  index,
  value,
  arraysByRef,
  expandKey,
  expandedArrays,
  toggleExpand,
  indent,
}: {
  index: number;
  value: string;
  arraysByRef: Map<number, { dynamic: boolean; values: string[] }>;
  expandKey: string;
  expandedArrays: Set<string>;
  toggleExpand: (key: string) => void;
  indent: number;
}) {
  const arrayRef = getArrayRef(value);
  const arrayView = arrayRef === null ? null : (arraysByRef.get(arrayRef) ?? null);
  const isExpanded = expandedArrays.has(expandKey);

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: role set conditionally */}
      <div
        className={`flex items-center gap-1 py-px font-[var(--font-mono)] text-[10px] hover:bg-[var(--hl-line)] ${arrayView ? "cursor-pointer" : ""}`}
        style={{ paddingLeft: `${8 + indent * 12}px` }}
        role={arrayView ? "button" : undefined}
        tabIndex={arrayView ? 0 : undefined}
        onClick={arrayView ? () => toggleExpand(expandKey) : undefined}
        onKeyDown={
          arrayView
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") toggleExpand(expandKey);
              }
            : undefined
        }
      >
        {arrayView ? (
          isExpanded ? (
            <ChevronDown size={9} className="shrink-0 text-[var(--text-dim)]" />
          ) : (
            <ChevronRight size={9} className="shrink-0 text-[var(--text-dim)]" />
          )
        ) : (
          <span className="w-[9px] shrink-0" />
        )}
        <span className="shrink-0 text-[var(--text-dim)]">[{index}]</span>
        {arrayView ? (
          <span className="text-[var(--purple)]">
            {arrayView.dynamic ? "vector" : "array"}[{arrayView.values.length}]
          </span>
        ) : (
          <span className="text-[var(--orange)]">{value}</span>
        )}
      </div>
      {arrayView && isExpanded && (
        <div className="max-h-[240px] overflow-y-auto [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
          {arrayView.values.map((val, i) => (
            <ArrayElementRow
              key={i}
              index={i}
              value={val}
              arraysByRef={arraysByRef}
              expandKey={`${expandKey}[${i}]`}
              expandedArrays={expandedArrays}
              toggleExpand={toggleExpand}
              indent={indent + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [expandedArrays, setExpandedArrays] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedArrays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderVarRow = (v: { name: string; kind: string; value: string }, scopeKey: string) => {
    const arrayRef = v.kind === "array" ? getArrayRef(v.value) : null;
    const arrayView = arrayRef === null ? null : (arraysByRef.get(arrayRef) ?? null);
    const expandKey = `${scopeKey}-${v.name}`;
    const isExpanded = expandedArrays.has(expandKey);
    const needsExpand = arrayView !== null && arrayView.values.length > COLLAPSE_THRESHOLD;

    return (
      <div key={expandKey}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: role set conditionally via prop */}
        <div
          className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 px-2 py-px pl-5 font-[var(--font-mono)] text-[11px] hover:bg-[var(--hl-line)] ${needsExpand ? "cursor-pointer" : ""}`}
          role={needsExpand ? "button" : undefined}
          tabIndex={needsExpand ? 0 : undefined}
          onClick={needsExpand ? () => toggleExpand(expandKey) : undefined}
          onKeyDown={
            needsExpand
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") toggleExpand(expandKey);
                }
              : undefined
          }
        >
          <span className="flex items-center gap-0.5 truncate text-[var(--accent2)]">
            {needsExpand &&
              (isExpanded ? (
                <ChevronDown size={10} className="shrink-0 text-[var(--text-dim)]" />
              ) : (
                <ChevronRight size={10} className="shrink-0 text-[var(--text-dim)]" />
              ))}
            {v.name}
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">
            {arrayView ? (arrayView.dynamic ? "vector" : "array") : v.kind}
            {arrayView ? `[${arrayView.values.length}]` : ""}
          </span>
          <span
            className={`max-w-[220px] truncate text-right ${
              arrayView ? "text-[10px] text-[var(--purple)]" : "text-[var(--orange)]"
            }`}
          >
            {arrayView
              ? needsExpand && !isExpanded
                ? `[${arrayView.values.slice(0, COLLAPSE_THRESHOLD).join(", ")}, …]`
                : `[${arrayView.values.join(", ")}]`
              : v.value}
          </span>
        </div>
        {arrayView && needsExpand && isExpanded && (
          <div className="border-l border-[var(--border)] ml-4 pb-1 max-h-[300px] overflow-y-auto [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
            {arrayView.values.map((val, i) => (
              <ArrayElementRow
                key={i}
                index={i}
                value={val}
                arraysByRef={arraysByRef}
                expandKey={`${expandKey}[${i}]`}
                expandedArrays={expandedArrays}
                toggleExpand={toggleExpand}
                indent={0}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--bg2)] lg:border-r lg:border-b-0">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1.5">
        <button
          className="toolbar-button"
          data-variant="primary"
          title="Launch Debugger"
          onClick={onLaunch}
          disabled={isPending}
        >
          <BugPlay size={14} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="run"
          title={execution.status === "paused" ? "Continue" : "Run to End"}
          onClick={onContinue}
          disabled={isPending}
        >
          <CirclePlay size={14} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="danger"
          title="Restart"
          onClick={onRestart}
          disabled={isPending}
        >
          <RotateCcw size={14} strokeWidth={2} />
        </button>
        <div className="mx-0.5 h-[14px] w-px bg-[var(--border2)]" />
        <button
          className="toolbar-button"
          title="Step Into"
          onClick={onStepInto}
          disabled={!canStep || isPending}
        >
          <ArrowDownToLine size={14} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          title="Step Over"
          onClick={onStepOver}
          disabled={!canStep || isPending}
        >
          <StepForward size={14} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          title="Step Out"
          onClick={onStepOut}
          disabled={!canStep || isPending}
        >
          <StepBack size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg2)] px-2 py-[3px] text-[11px] text-[var(--text-dim)]">
        <div className="status-dot" data-status={st} />
        <span className="status-label" data-status={st}>
          {st}
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-dim)]">
          L{execution.currentLine}
          {" · "}
          {execution.stepCount}steps
          {execution.pauseReason ? ` · ${execution.pauseReason}` : ""}
          {breakpoints.length > 0 ? ` · ${breakpoints.length}bp` : ""}
        </span>
      </div>

      {isDirty && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[rgba(206,145,120,0.08)] px-2 py-[3px] text-[10px] text-[var(--orange)]">
          <AlertCircle size={12} strokeWidth={2} />
          <span>Source changed - next action will restart</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
        <div className="border-b border-[var(--border)]">
          <div className="flex select-none items-center gap-[5px] border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
            Input
            <span className="ml-auto rounded-[2px] bg-[var(--bg4)] px-1 text-[10px] text-[var(--text-dim)]">
              {execution.input.nextIndex}/{execution.input.tokens.length}
            </span>
          </div>
          {execution.input.tokens.length === 0 ? (
            <div className="px-5 py-[3px] text-[11px] italic text-[var(--text-dim)]">
              No stdin tokens
            </div>
          ) : (
            <div className="px-2 pb-2 pt-1.5 font-[var(--font-mono)]">
              {execution.input.tokens.slice(execution.input.nextIndex).join(" ")}
            </div>
          )}
        </div>

        <div className="border-b border-[var(--border)]">
          <div className="flex select-none items-center gap-[5px] border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
            Call Stack
            <span className="ml-auto rounded-[2px] bg-[var(--bg4)] px-1 text-[10px] text-[var(--text-dim)]">
              {execution.callStack.length}
            </span>
          </div>
          {execution.callStack.length === 0 ? (
            <div className="px-5 py-[3px] text-[11px] italic text-[var(--text-dim)]">
              No active frames
            </div>
          ) : (
            <ul className="list-none">
              {[...execution.callStack].reverse().map((frame, i) => (
                <li
                  key={`${frame.functionName}-${frame.line}-${i}`}
                  className={`flex cursor-default items-center gap-1.5 px-2 py-0.5 pl-4 text-[11px] hover:bg-[var(--hl-line)] ${
                    i === 0 ? "text-[var(--yellow)]" : ""
                  }`}
                >
                  <span className="flex-1 truncate">{frame.functionName}()</span>
                  <span className="shrink-0 text-[10px] text-[var(--text-dim)]">:{frame.line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-b border-[var(--border)]">
          <div className="flex select-none items-center gap-[5px] border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
            Variables
            <span className="ml-auto rounded-[2px] bg-[var(--bg4)] px-1 text-[10px] text-[var(--text-dim)]">
              {execution.localVars.reduce((n, s) => n + s.vars.length, 0)}
            </span>
          </div>
          {execution.localVars.length === 0 ? (
            <div className="px-5 py-[3px] text-[11px] italic text-[var(--text-dim)]">
              No local variables
            </div>
          ) : (
            execution.localVars.map((scope, idx) => (
              <div key={`${scope.name}-${idx}`} className="py-0.5">
                <div className="px-2 py-px pl-3 text-[10px] italic text-[var(--text-dim)]">
                  {getScopeTitle(scope, idx)}
                </div>
                {scope.vars.map((v) => renderVarRow(v, scope.name))}
              </div>
            ))
          )}
        </div>

        {execution.globalVars.length > 0 && (
          <div className="border-b border-[var(--border)]">
            <div className="flex select-none items-center gap-[5px] border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--text-dim)] uppercase">
              Globals
              <span className="ml-auto rounded-[2px] bg-[var(--bg4)] px-1 text-[10px] text-[var(--text-dim)]">
                {execution.globalVars.length}
              </span>
            </div>
            <div className="py-0.5">
              {execution.globalVars.map((v) => renderVarRow(v, "global"))}
            </div>
          </div>
        )}

        {execution.error && (
          <div className="border-b border-[var(--border)]">
            <div className="flex select-none items-center gap-[5px] border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--red)] uppercase">
              Error
            </div>
            <div className="break-all whitespace-pre-wrap px-2 py-1 font-[var(--font-mono)] text-[11px] text-[var(--red)]">
              {execution.error.message}
            </div>
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
    <div className="grid min-h-0 overflow-hidden border-t border-[var(--border)] grid-cols-[minmax(180px,1fr)_minmax(0,1.4fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--border)]">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg3)] px-2 py-[3px] text-[10px] font-bold tracking-[0.06em] text-[var(--text-dim)] uppercase">
          <ArrowRight size={12} strokeWidth={2} />
          stdin
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 py-1 text-[12px] leading-[1.5] [scrollbar-color:var(--bg4)_transparent] [scrollbar-width:thin]">
          <textarea
            className="h-full w-full resize-none border-0 bg-transparent font-[var(--font-mono)] text-[12px] leading-[1.5] text-[var(--text)] outline-none"
            spellCheck={false}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="stdin..."
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg3)]">
          <div className="flex w-full">
            <button
              type="button"
              className="io-tab border-r border-[var(--border)]"
              data-active={activeOutputTab === "stdout"}
              onClick={() => onOutputTabChange("stdout")}
            >
              <ArrowLeft size={12} strokeWidth={2} />
              stdout
            </button>
            <button
              type="button"
              className="io-tab"
              data-active={activeOutputTab === "stderr"}
              onClick={() => onOutputTabChange("stderr")}
            >
              <AlertCircle size={12} strokeWidth={2} className="text-[var(--red)]" />
              stderr
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 py-1 text-[12px] leading-[1.5] [scrollbar-color:var(--bg4)_transparent] [scrollbar-width:thin]">
          {activeOutputTab === "stdout" ? (
            execution.output.stdout ? (
              <pre className="m-0 break-all whitespace-pre-wrap font-[var(--font-mono)] text-[var(--text)]">
                {execution.output.stdout}
              </pre>
            ) : (
              <span className="text-[11px] italic text-[var(--text-dim)]">empty</span>
            )
          ) : execution.output.stderr ? (
            <pre className="m-0 break-all whitespace-pre-wrap font-[var(--font-mono)] text-[var(--red)]">
              {execution.output.stderr}
            </pre>
          ) : (
            <span className="text-[11px] italic text-[var(--text-dim)]">empty</span>
          )}
        </div>
      </div>
    </div>
  );
}
