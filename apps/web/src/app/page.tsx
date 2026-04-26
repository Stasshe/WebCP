"use client";

import { usePlaygroundSession } from "@web/hooks/use-playground-session";
import { EditorPane } from "@web/components/editor-pane";
import { DebugSidebar } from "@web/components/debug-sidebar";
import { IOPanels } from "@web/components/io-panels";
import { LoadingScreen } from "@web/components/loading-screen";

export default function Home() {
  const {
    activeOutputTab,
    arraysByRef,
    breakpoints,
    canStep,
    editorHostRef,
    execution,
    handleContinue,
    handleInputChange,
    handleLaunch,
    handleRestart,
    handleStepInto,
    handleStepOut,
    handleStepOver,
    hasRestored,
    input,
    isDirty,
    isPending,
    setActiveOutputTab,
  } = usePlaygroundSession();

  if (!hasRestored) {
    return <LoadingScreen />;
  }

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[minmax(280px,38vh)_1fr] overflow-hidden lg:grid-cols-[minmax(320px,4fr)_minmax(0,6fr)] lg:grid-rows-[100vh]">
      <DebugSidebar
        execution={execution}
        breakpoints={breakpoints}
        isDirty={isDirty}
        isPending={isPending}
        canStep={canStep}
        arraysByRef={arraysByRef}
        onLaunch={handleLaunch}
        onContinue={handleContinue}
        onRestart={handleRestart}
        onStepInto={handleStepInto}
        onStepOver={handleStepOver}
        onStepOut={handleStepOut}
      />

      <div className="grid min-h-0 grid-rows-[1fr_180px] overflow-hidden bg-[var(--bg)]">
        <EditorPane editorHostRef={editorHostRef} />
        <IOPanels
          input={input}
          activeOutputTab={activeOutputTab}
          execution={execution}
          onInputChange={handleInputChange}
          onOutputTabChange={setActiveOutputTab}
        />
      </div>
    </div>
  );
}
