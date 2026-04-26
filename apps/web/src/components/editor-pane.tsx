import type { RefObject } from "react";

type EditorPaneProps = {
  editorHostRef: RefObject<HTMLDivElement | null>;
};

export function EditorPane({ editorHostRef }: EditorPaneProps) {
  return (
    <div className="min-h-0 overflow-hidden border-b border-[var(--border)]">
      <div ref={editorHostRef} className="h-full min-h-0" />
    </div>
  );
}
