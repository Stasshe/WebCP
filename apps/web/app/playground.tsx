"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EditorView } from "@codemirror/view";
import { DebugSession } from "@clientsidecpp/index";
import type { DebugState } from "@clientsidecpp/types";
import {
  createPlaygroundEditorState,
  reconfigureBreakpoints,
  reconfigureExecution,
  scrollLineIntoView,
  syncEditorDoc,
} from "./playground-editor";
import { DebugSidebar, IOPanels } from "./playground-panels";
import {
  cloneState,
  createInitialExecution,
  readPersistedPlayground,
  starterInput,
  starterSource,
  storageKeys,
} from "./playground-state";

export function Playground() {
  const [source, setSource] = useState(starterSource);
  const [input, setInput] = useState(starterInput);
  const [execution, setExecution] = useState<DebugState>(() => createInitialExecution(starterInput));
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<"stdout" | "stderr">("stdout");
  const [hasRestored, setHasRestored] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef<DebugSession | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const arraysByRef = useMemo(
    () => new Map(execution.arrays.map((arr) => [arr.ref, arr])),
    [execution.arrays]
  );
  const hasSession = sessionRef.current !== null;
  const canStep = hasSession && execution.status !== "done" && execution.status !== "error";

  const syncBreakpointState = (session: DebugSession | null, next: number[]) => {
    if (!session) return;
    for (const l of session.listBreakpoints()) session.removeBreakpoint(l);
    for (const l of next) session.setBreakpoint(l);
  };

  const resetExecution = (nextInput = inputRef.current) => {
    sessionRef.current = null;
    setExecution(createInitialExecution(nextInput));
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
    const persisted = readPersistedPlayground();
    if (persisted !== null) {
      setSource(persisted.source);
      setInput(persisted.input);
      inputRef.current = persisted.input;
      setExecution(createInitialExecution(persisted.input));
    }
    setHasRestored(true);
  }, []);

  useEffect(() => {
    if (!editorHostRef.current) return;

    const state = createPlaygroundEditorState({
      doc: source,
      breakpoints,
      onToggleBreakpoint: toggleBreakpoint,
      onSourceChange: (nextSource) => {
        setSource(nextSource);
        setIsDirty(true);
        resetExecution();
      },
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
    reconfigureBreakpoints(view, breakpoints, toggleBreakpoint);
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

    reconfigureExecution(view, activeLine, execution.executionRange);
    if (activeLine !== null) {
      scrollLineIntoView(view, activeLine);
    }
  }, [execution.currentLine, execution.executionRange, execution.status]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    syncEditorDoc(view, source);
  }, [source]);

  useEffect(() => {
    if (!hasRestored) return;
    window.localStorage.setItem(storageKeys.source, source);
  }, [hasRestored, source]);

  useEffect(() => {
    if (!hasRestored) return;
    window.localStorage.setItem(storageKeys.input, input);
  }, [hasRestored, input]);

  return (
    <div className="ide">
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

      <div className="right">
        <div className="editor-area">
          <div ref={editorHostRef} className="code-editor" />
        </div>

        <IOPanels
          input={input}
          activeOutputTab={activeOutputTab}
          execution={execution}
          onInputChange={(nextInput) => {
            setInput(nextInput);
            inputRef.current = nextInput;
            setIsDirty(true);
            resetExecution(nextInput);
          }}
          onOutputTabChange={setActiveOutputTab}
        />
      </div>
    </div>
  );
}
