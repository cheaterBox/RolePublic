"use client";

import { indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { latex } from "codemirror-lang-latex";
import { useCallback, useMemo, useRef } from "react";
import "@fontsource/jetbrains-mono";

// ─────────────────────────────────────────────────────────────
// Production-grade LaTeX editor — CodeMirror 6 + LaTeX grammar
// Mirrors desktop `src/components/JobDetailView.vue:82` extensions:
//   latex(), latexLanguage, autoCloseTags, oneDark, lineWrapping
// Added: history, bracketMatching, save/compile keybindings, activeLine
// ─────────────────────────────────────────────────────────────

export type CursorPos = { line: number; col: number; offset: number };

type LatexEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onCompile?: () => void;
  onCursorChange?: (pos: CursorPos) => void;
  onCreateEditor?: (view: EditorView) => void;
  height?: string;
  placeholder?: string;
  readOnly?: boolean;
};

// Custom dark theme that stitches CodeMirror into the app palette
// Background matches #0d1117 (editor) and #0d0f14 (outer), foreground #e6edf3
const roletectTheme = EditorView.theme(
  {
    "&": {
      fontFamily:
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: "13px",
      lineHeight: "1.65",
      height: "100%",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "#58a6ff",
    },
    ".cm-line": {
      padding: "0 16px",
    },
    ".cm-scroller": {
      fontFamily:
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      overflow: "auto",
    },
    ".cm-gutters": {
      backgroundColor: "#0d1117",
      color: "#484f58",
      borderRight: "1px solid #21262d",
      fontSize: "12px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(88,166,255,0.08)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(88,166,255,0.07)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(88,166,255,0.25) !important",
    },
    ".cm-focused .cm-cursor": {
      borderLeftColor: "#58a6ff",
      borderLeftWidth: "2px",
    },
    ".cm-placeholder": {
      color: "#6e7681",
      fontStyle: "italic",
    },
  },
  { dark: true },
);

export function LatexEditor({
  value,
  onChange,
  onSave,
  onCompile,
  onCursorChange,
  onCreateEditor,
  height = "100%",
  placeholder = "% Start typing LaTeX...",
  readOnly = false,
}: LatexEditorProps) {
  // Ctrl/Cmd+S → save, Ctrl/Cmd+Enter → compile
  const customKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSave?.();
            return true;
          },
        },
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onCompile?.();
            return true;
          },
        },
        indentWithTab,
      ]),
    [onSave, onCompile],
  );

  const handleCreate = useCallback(
    (view: EditorView) => {
      onCreateEditor?.(view);
    },
    [onCreateEditor],
  );

  // Guard against infinite loops: @uiw/react-codemirror fires onUpdate on
  // every transaction *and* on every React render. Calling setState
  // unconditionally with a new object reference triggers
  // "Maximum update depth exceeded" as parent re-renders → new onUpdate → setState loop.
  // We only forward when line/col actually change and de-dupe identical positions.
  const prevPosRef = useRef<CursorPos | null>(null);
  const handleUpdate = useCallback(
    (viewUpdate: { state: EditorState; view: EditorView }) => {
      if (!onCursorChange) return;
      if (!viewUpdate.state) return;
      // Only fire when selection explicitly changed — avoids doc-only updates
      // viewUpdate.transactions exists on real ViewUpdate but @uiw types it loosely;
      // fall back to always checking selection diff if unavailable.
      const transactions = (
        viewUpdate as unknown as { transactions?: { selection?: unknown }[] }
      ).transactions;
      const selectionChanged = transactions
        ? transactions.some((tr) => tr.selection !== undefined)
        : true;
      // For typing, docChanged also moves cursor, so we must still check selection head diff;
      // guard below on prevPosRef handles docChanged case.
      if (transactions && !selectionChanged) {
        const docChanged = (viewUpdate as unknown as { docChanged?: boolean })
          .docChanged;
        if (!docChanged) return;
      }
      const head = viewUpdate.state.selection.main.head;
      const line = viewUpdate.state.doc.lineAt(head);
      const next: CursorPos = {
        line: line.number,
        col: head - line.from + 1,
        offset: head,
      };
      const prev = prevPosRef.current;
      if (prev && prev.line === next.line && prev.col === next.col) return;
      prevPosRef.current = next;
      onCursorChange(next);
    },
    [onCursorChange],
  );

  // Build extensions once per relevant dep change
  // IMPORTANT: order matters — theme after language so token colors win correctly
  const extensions = useMemo(
    () => [
      latex(),
      oneDark,
      roletectTheme,
      EditorView.lineWrapping,
      customKeymap,
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({
        spellcheck: "false",
        autocorrect: "off",
      }),
      EditorState.readOnly.of(readOnly),
    ],
    [customKeymap, readOnly],
  );

  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      extensions={extensions}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        foldGutter: true,
        drawSelection: true,
        dropCursor: true,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightSelectionMatches: false,
        closeBracketsKeymap: true,
        searchKeymap: true,
        foldKeymap: true,
        completionKeymap: true,
        lintKeymap: false,
      }}
      onChange={onChange}
      onUpdate={handleUpdate}
      onCreateEditor={handleCreate}
      style={{
        height,
        flex: "1 1 0%",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      className="cm-roletect flex-1 min-h-0"
    />
  );
}

export default LatexEditor;
