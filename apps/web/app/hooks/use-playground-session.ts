"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EditorView } from "@codemirror/view";
import { DebugSession } from "@/index";
import type { DebugState } from "@/types";
import {
  createPlaygroundEditorState,
  reconfigureBreakpoints,
  reconfigureExecution,
  scrollLineIntoView,
  syncEditorDoc,
} from "../lib/playground/editor";
import {
  cloneState,
  createInitialExecution,
  readPersistedPlayground,
  starterInput,
  starterSource,
  storageKeys,
} from "../lib/playground/state";

function syncBreakpointState(session: DebugSession | null, nextBreakpoints: number[]) {
  if (!session) {
    return;
  }

  for (const line of session.listBreakpoints()) {
    session.removeBreakpoint(line);
  }

  for (const line of nextBreakpoints) {
    session.setBreakpoint(line);
  }
}

export function usePlaygroundSession() {
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
    () => new Map(execution.arrays.map((array) => [array.ref, array])),
    [execution.arrays]
  );

  const hasSession = sessionRef.current !== null;
  const canStep = hasSession && execution.status !== "done" && execution.status !== "error";

  const resetExecution = (nextInput = inputRef.current) => {
    sessionRef.current = null;
    setExecution(createInitialExecution(nextInput));
  };

  const withFreshSession = () => {
    const nextSession = new DebugSession(source, input);
    syncBreakpointState(nextSession, breakpoints);
    sessionRef.current = nextSession;
    return nextSession;
  };

  const applyState = (state: DebugState) => {
    setExecution(cloneState(state));
    setIsDirty(false);
  };

  const runAction = (
    action: (session: DebugSession) => DebugState,
    options: { restart?: boolean } = {}
  ) => {
    startTransition(() => {
      let session = sessionRef.current;
      if (options.restart || session === null) {
        session = withFreshSession();
      }

      applyState(action(session));
    });
  };

  const handleLaunch = () => runAction((session) => session.stepInto(), { restart: true });
  const handleRestart = () => runAction((session) => session.stepInto(), { restart: true });
  const handleContinue = () => runAction((session) => session.run(), { restart: isDirty });
  const handleStepInto = () => runAction((session) => session.stepInto(), { restart: isDirty });
  const handleStepOver = () => runAction((session) => session.stepOver(), { restart: isDirty });
  const handleStepOut = () => runAction((session) => session.stepOut(), { restart: isDirty });

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((currentBreakpoints) => {
      const nextBreakpoints = currentBreakpoints.includes(line)
        ? currentBreakpoints.filter((value) => value !== line)
        : [...currentBreakpoints, line].sort((left, right) => left - right);

      syncBreakpointState(sessionRef.current, nextBreakpoints);
      return nextBreakpoints;
    });
  };

  const handleInputChange = (nextInput: string) => {
    setInput(nextInput);
    inputRef.current = nextInput;
    setIsDirty(true);
    resetExecution(nextInput);
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
    if (!editorHostRef.current || !hasRestored) {
      return;
    }

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
  }, [hasRestored]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    reconfigureBreakpoints(view, breakpoints, toggleBreakpoint);
  }, [breakpoints]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    let activeLine: number | null = null;
    if (
      execution.status === "paused" ||
      execution.status === "done" ||
      execution.status === "error"
    ) {
      activeLine = execution.currentLine;
    }

    reconfigureExecution(view, activeLine, execution.executionRange);
    if (activeLine !== null) {
      scrollLineIntoView(view, activeLine);
    }
  }, [execution.currentLine, execution.executionRange, execution.status]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    syncEditorDoc(view, source);
  }, [source]);

  useEffect(() => {
    if (!hasRestored) {
      return;
    }

    window.localStorage.setItem(storageKeys.source, source);
  }, [hasRestored, source]);

  useEffect(() => {
    if (!hasRestored) {
      return;
    }

    window.localStorage.setItem(storageKeys.input, input);
  }, [hasRestored, input]);

  return {
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
  };
}
