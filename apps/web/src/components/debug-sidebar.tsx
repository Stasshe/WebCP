import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  BugPlay,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  RotateCcw,
  StepBack,
  StepForward,
} from "lucide-react";
import type { DebugState } from "@/types";
import {
  formatArrayLabel,
  formatMetricsText,
  formatVariableKind,
  formatVariablePreview,
  getArrayView,
  type PlaygroundArrayView,
} from "@web/lib/display";
import { getScopeTitle } from "@web/lib/state";

type VariableValueTreeProps = {
  arraysByRef: Map<number, PlaygroundArrayView>;
  expandedKeys: Set<string>;
  indent: number;
  index: number;
  toggleExpand: (key: string) => void;
  value: string;
  valueKey: string;
};

type InputDisplayPart = {
  text: string;
  tokenIndex: number;
};

function buildInputDisplayParts(input: string): InputDisplayPart[] {
  if (input.length === 0) {
    return [];
  }

  const parts: InputDisplayPart[] = [];
  const pattern = /\S+\s*/g;

  for (const [tokenIndex, match] of Array.from(input.matchAll(pattern)).entries()) {
    const text = match[0];
    if (text !== undefined) {
      parts.push({ text, tokenIndex });
    }
  }

  return parts;
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown size={12} className="shrink-0 text-[var(--text-dim)]" />
  ) : (
    <ChevronRight size={12} className="shrink-0 text-[var(--text-dim)]" />
  );
}

function SectionHeader({
  label,
  count,
  tone = "default",
}: {
  label: string;
  count?: number;
  tone?: "default" | "error";
}) {
  const textColor = tone === "error" ? "text-[var(--red)]" : "text-[var(--text-dim)]";

  return (
    <div
      className={`flex select-none items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg3)] px-3 py-1.5 text-[10.8px] font-bold tracking-[0.08em] uppercase ${textColor}`}
    >
      {label}
      {typeof count === "number" ? (
        <span className="ml-auto rounded-[3px] bg-[var(--bg4)] px-1.5 text-[10.8px] text-[var(--text-dim)]">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-6 py-1 text-[12.6px] italic text-[var(--text-dim)]">{children}</div>;
}

function VariableValueTree({
  arraysByRef,
  expandedKeys,
  indent,
  index,
  toggleExpand,
  value,
  valueKey,
}: VariableValueTreeProps) {
  const arrayView = getArrayView(value, arraysByRef);
  const isExpanded = expandedKeys.has(valueKey);
  const hasChildren = arrayView !== null;
  const rowPadding = `${10 + indent * 15}px`;

  const handleToggle = () => {
    if (hasChildren) {
      toggleExpand(valueKey);
    }
  };

  return (
    <div>
      <div
        className={`debug-vars-font flex items-center gap-1.5 py-0.5 text-[10.8px] hover:bg-[var(--hl-line)] ${hasChildren ? "cursor-pointer" : ""}`}
        style={{ paddingLeft: rowPadding }}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={hasChildren ? handleToggle : undefined}
        onKeyDown={
          hasChildren
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  toggleExpand(valueKey);
                }
              }
            : undefined
        }
      >
        {hasChildren ? <ExpandIcon expanded={isExpanded} /> : <span className="w-[12px] shrink-0" />}
        <span className="shrink-0 text-[var(--text-dim)]">[{index}]</span>
        {arrayView ? (
          <span className="text-[var(--purple)]">{formatArrayLabel(arrayView)}</span>
        ) : (
          <span className="text-[var(--orange)]">{value}</span>
        )}
      </div>
      {arrayView && isExpanded ? (
        <div className="max-h-[300px] overflow-y-auto [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
          {arrayView.values.map((childValue, childIndex) => (
            <VariableValueTree
              key={childIndex}
              arraysByRef={arraysByRef}
              expandedKeys={expandedKeys}
              indent={indent + 1}
              index={childIndex}
              toggleExpand={toggleExpand}
              value={childValue}
              valueKey={`${valueKey}[${childIndex}]`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type VariableRowProps = {
  arraysByRef: Map<number, PlaygroundArrayView>;
  expandedKeys: Set<string>;
  scopeKey: string;
  toggleExpand: (key: string) => void;
  variable: { name: string; kind: string; value: string };
};

function VariableRow({
  arraysByRef,
  expandedKeys,
  scopeKey,
  toggleExpand,
  variable,
}: VariableRowProps) {
  const arrayView = getArrayView(variable.value, arraysByRef);
  const rowKey = `${scopeKey}-${variable.name}`;
  const isExpanded = expandedKeys.has(rowKey);
  const isExpandable = arrayView !== null;
  const previewClassName =
    arrayView === null ? "text-[var(--orange)]" : "text-[10.8px] text-[var(--purple)]";

  const handleToggle = () => {
    if (isExpandable) {
      toggleExpand(rowKey);
    }
  };

  return (
    <div>
      <div
        className={`debug-vars-font grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 px-3 py-0.5 pl-6 text-[12.6px] hover:bg-[var(--hl-line)] ${isExpandable ? "cursor-pointer" : ""}`}
        role={isExpandable ? "button" : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        onClick={isExpandable ? handleToggle : undefined}
        onKeyDown={
          isExpandable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  toggleExpand(rowKey);
                }
              }
            : undefined
        }
      >
        <span className="flex items-center gap-0.5 truncate text-[var(--accent2)]">
          {isExpandable ? <ExpandIcon expanded={isExpanded} /> : null}
          {variable.name}
        </span>
        <span className="text-[10.8px] text-[var(--text-dim)]">
          {formatVariableKind(variable.kind, arrayView)}
        </span>
        <span className={`max-w-[275px] truncate text-right ${previewClassName}`}>
          {formatVariablePreview(variable.value, arraysByRef)}
        </span>
      </div>
      {arrayView && isExpanded ? (
        <div className="ml-5 max-h-[200px] overflow-y-auto border-l border-[var(--border)] pb-1.5 [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
          {arrayView.values.map((value, index) => (
            <VariableValueTree
              key={index}
              arraysByRef={arraysByRef}
              expandedKeys={expandedKeys}
              indent={0}
              index={index}
              toggleExpand={toggleExpand}
              value={value}
              valueKey={`${rowKey}[${index}]`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type DebugSidebarProps = {
  execution: DebugState;
  input: string;
  breakpoints: number[];
  isDirty: boolean;
  isPending: boolean;
  canStep: boolean;
  arraysByRef: Map<number, PlaygroundArrayView>;
  onLaunch: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onStepInto: () => void;
  onStepOver: () => void;
  onStepOut: () => void;
};

export function DebugSidebar({
  execution,
  input,
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
}: DebugSidebarProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  };

  const variableCount = execution.localVars.reduce((count, scope) => count + scope.vars.length, 0);
  const metricsText = formatMetricsText(
    execution.currentLine,
    execution.stepCount,
    execution.pauseReason,
    breakpoints.length
  );
  const continueLabel = execution.status === "paused" ? "Continue" : "Run to End";
  const inputDisplayParts = buildInputDisplayParts(input);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--bg2)] lg:border-r lg:border-b-0">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg3)] px-3 py-2">
        <button
          className="toolbar-button"
          data-variant="primary"
          title="Launch Debugger"
          onClick={onLaunch}
          disabled={isPending}
        >
          <BugPlay size={18} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="run"
          title={continueLabel}
          onClick={onContinue}
          disabled={isPending}
        >
          <CirclePlay size={18} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="danger"
          title="Restart"
          onClick={onRestart}
          disabled={isPending}
        >
          <RotateCcw size={18} strokeWidth={2} />
        </button>
        <div className="mx-1 h-[18px] w-px bg-[var(--border2)]" />
        <button
          className="toolbar-button"
          data-variant="step-into"
          title="Step Into"
          onClick={onStepInto}
          disabled={!canStep || isPending}
        >
          <ArrowDownToLine size={18} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="step-over"
          title="Step Over"
          onClick={onStepOver}
          disabled={!canStep || isPending}
        >
          <StepForward size={18} strokeWidth={2} />
        </button>
        <button
          className="toolbar-button"
          data-variant="step-out"
          title="Step Out"
          onClick={onStepOut}
          disabled={!canStep || isPending}
        >
          <StepBack size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg2)] px-3 py-1 text-[12.6px] text-[var(--text-dim)]">
        <div className="status-dot" data-status={execution.status} />
        <span className="status-label" data-status={execution.status}>
          {execution.status}
        </span>
        <span className="ml-auto text-[10.8px] text-[var(--text-dim)]">{metricsText}</span>
      </div>

      {isDirty ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[rgba(206,145,120,0.08)] px-3 py-1 text-[10.8px] text-[var(--orange)]">
          <AlertCircle size={14} strokeWidth={2} />
          <span>Source changed - next action will restart</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:var(--border2)_transparent] [scrollbar-width:thin]">
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label="Input"
            count={execution.input.tokens.length}
          />
          {execution.input.tokens.length === 0 ? (
            <EmptyState>No stdin tokens</EmptyState>
          ) : (
            <pre className="m-0 px-3 pb-3 pt-2 whitespace-pre-wrap break-all font-[var(--font-mono)] text-[12.6px] leading-[1.5] text-[var(--text)]">
              {inputDisplayParts
                .filter((part) => part.tokenIndex >= execution.input.nextIndex)
                .map((part, index) => (
                  <span key={`token-${part.tokenIndex}-${index}`}>{part.text}</span>
                ))}
            </pre>
          )}
        </div>

        <div className="border-b border-[var(--border)]">
          <SectionHeader label="Call Stack" count={execution.callStack.length} />
          {execution.callStack.length === 0 ? (
            <EmptyState>No active frames</EmptyState>
          ) : (
            <ul className="list-none">
              {[...execution.callStack].reverse().map((frame, index) => (
                <li
                  key={`${frame.functionName}-${frame.line}-${index}`}
                  className={`flex cursor-default items-center gap-2 px-3 py-1 pl-5 text-[12.6px] hover:bg-[var(--hl-line)] ${index === 0 ? "text-[var(--yellow)]" : ""}`}
                >
                  <span className="flex-1 truncate">{frame.functionName}()</span>
                  <span className="shrink-0 text-[10.8px] text-[var(--text-dim)]">:{frame.line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-b border-[var(--border)]">
          <SectionHeader label="Variables" count={variableCount} />
          {execution.localVars.length === 0 ? (
            <EmptyState>No local variables</EmptyState>
          ) : (
            execution.localVars.map((scope, index) => (
              <div key={`${scope.name}-${index}`} className="py-0.5">
                <div className="px-3 py-0.5 pl-4 text-[10.8px] italic text-[var(--text-dim)]">
                  {getScopeTitle(scope, index)}
                </div>
                {scope.vars.map((variable) => (
                  <VariableRow
                    key={`${scope.name}-${variable.name}`}
                    arraysByRef={arraysByRef}
                    expandedKeys={expandedKeys}
                    scopeKey={scope.name}
                    toggleExpand={toggleExpand}
                    variable={variable}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {execution.globalVars.length > 0 ? (
          <div className="border-b border-[var(--border)]">
            <SectionHeader label="Globals" count={execution.globalVars.length} />
            <div className="py-0.5">
              {execution.globalVars.map((variable) => (
                <VariableRow
                  key={`global-${variable.name}`}
                  arraysByRef={arraysByRef}
                  expandedKeys={expandedKeys}
                  scopeKey="global"
                  toggleExpand={toggleExpand}
                  variable={variable}
                />
              ))}
            </div>
          </div>
        ) : null}

        {execution.error ? (
          <div className="border-b border-[var(--border)]">
            <SectionHeader label="Error" tone="error" />
            <div className="break-all whitespace-pre-wrap px-3 py-2 font-[var(--font-mono)] text-[12.6px] text-[var(--red)]">
              {execution.error.message}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
