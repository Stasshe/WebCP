import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import type { DebugState } from "@/types";

type OutputTab = "stdout" | "stderr";

type IOPanelsProps = {
  input: string;
  activeOutputTab: OutputTab;
  execution: DebugState;
  onInputChange: (nextInput: string) => void;
  onOutputTabChange: (tab: OutputTab) => void;
};

function OutputContent({
  activeOutputTab,
  execution,
}: Pick<IOPanelsProps, "activeOutputTab" | "execution">) {
  if (activeOutputTab === "stdout") {
    if (!execution.output.stdout) {
      return <span className="text-[11px] italic text-[var(--text-dim)]">empty</span>;
    }

    return (
      <pre className="m-0 break-all whitespace-pre-wrap font-[var(--font-mono)] text-[var(--text)]">
        {execution.output.stdout}
      </pre>
    );
  }

  if (!execution.output.stderr) {
    return <span className="text-[11px] italic text-[var(--text-dim)]">empty</span>;
  }

  return (
    <pre className="m-0 break-all whitespace-pre-wrap font-[var(--font-mono)] text-[var(--red)]">
      {execution.output.stderr}
    </pre>
  );
}

export function IOPanels({
  input,
  activeOutputTab,
  execution,
  onInputChange,
  onOutputTabChange,
}: IOPanelsProps) {
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
            onChange={(event) => onInputChange(event.target.value)}
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
          <OutputContent activeOutputTab={activeOutputTab} execution={execution} />
        </div>
      </div>
    </div>
  );
}
