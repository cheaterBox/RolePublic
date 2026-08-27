"use client";

import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { latex } from "codemirror-lang-latex";
import { mermaid } from "codemirror-lang-mermaid";
import { useCallback, useMemo, useRef } from "react";
import "@fontsource/jetbrains-mono";

export type CursorPos = { line: number; col: number; offset: number };

export type CodeLanguage = "latex" | "markdown" | "mermaid" | "plaintext";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: CodeLanguage;
  onSave?: () => void;
  onCompile?: () => void;
  onCursorChange?: (pos: CursorPos) => void;
  onCreateEditor?: (view: EditorView) => void;
  height?: string;
  placeholder?: string;
  readOnly?: boolean;
};

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

function getLanguageExtension(lang: CodeLanguage) {
  switch (lang) {
    case "latex":
      return latex();
    case "markdown":
      return markdown();
    case "mermaid":
      try {
        return mermaid();
      } catch {
        return [];
      }
    default:
      return [];
  }
}

export function CodeEditor({
  value,
  onChange,
  language = "plaintext",
  onSave,
  onCompile,
  onCursorChange,
  onCreateEditor,
  height = "100%",
  placeholder,
  readOnly = false,
}: CodeEditorProps) {
  const fallbackPlaceholder =
    language === "mermaid"
      ? "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[OK]\n  B -->|No| D[Fix]"
      : language === "markdown"
        ? "# Title\n\nWrite **markdown** with `code`, lists, tables…\n\n```mermaid\ngraph TD\n  A-->B\n```"
        : language === "latex"
          ? "% LaTeX document — syntax highlighting & bracket matching"
          : "Start typing...";

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

  const prevPosRef = useRef<CursorPos | null>(null);
  const handleUpdate = useCallback(
    (viewUpdate: { state: EditorState; view: EditorView }) => {
      if (!onCursorChange) return;
      if (!viewUpdate.state) return;
      const transactions = (
        viewUpdate as unknown as { transactions?: { selection?: unknown }[] }
      ).transactions;
      const selectionChanged = transactions
        ? transactions.some((tr) => tr.selection !== undefined)
        : true;
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

  const extensions = useMemo(() => {
    const langExt = getLanguageExtension(language);
    const exts: any[] = [];
    // language extension can be array or single
    if (Array.isArray(langExt)) exts.push(...langExt);
    else if (langExt) exts.push(langExt);
    exts.push(
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
    );
    return exts;
  }, [language, customKeymap, readOnly]);

  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      extensions={extensions}
      placeholder={placeholder ?? fallbackPlaceholder}
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

export default CodeEditor;
