import { copyText } from "./clipboard";

export interface DesktopTextTarget {
  element: HTMLElement;
  selection: string;
  canPaste: boolean;
  canSelectAll: boolean;
  restore(): void;
  selectAll(): void;
}

/** xterm's selection lives in its buffer, not in document.getSelection(). */
const terminals = new WeakMap<HTMLElement, () => DesktopTextTarget>();
export function registerDesktopTerminal(element: HTMLElement, snapshot: () => DesktopTextTarget) {
  terminals.set(element, snapshot);
  return () => { terminals.delete(element); };
}

export function desktopTextTarget(element: HTMLElement): DesktopTextTarget | null {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const terminal = terminals.get(node);
    if (terminal) return terminal();
  }
  const field = element.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (field) {
    if (field instanceof HTMLInputElement && !["text", "search", "url", "tel", "email", "password", "number"].includes(field.type)) return null;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const direction = field.selectionDirection ?? "none";
    return {
      element: field,
      selection: field.type !== "password" && start !== null && end !== null ? field.value.slice(start, end) : "",
      canPaste: !field.disabled && !field.readOnly,
      canSelectAll: !field.disabled && field.value.length > 0,
      restore() {
        field.focus({ preventScroll: true });
        if (start !== null && end !== null) field.setSelectionRange(start, end, direction);
      },
      selectAll() { field.focus({ preventScroll: true }); field.select(); },
    };
  }
  const editable = element.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
  const scope = editable ?? element.closest<HTMLElement>("pre, [data-desktop-text-scope], .file-viewer-content");
  if (!scope) return null;
  const selection = window.getSelection();
  const range = selection?.rangeCount && scope.contains(selection.anchorNode) && scope.contains(selection.focusNode)
    ? selection.getRangeAt(0).cloneRange() : null;
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement : scope;
  return {
    element: editable ?? focus,
    selection: range ? selection?.toString() ?? "" : "",
    canPaste: Boolean(editable),
    canSelectAll: Boolean(scope.textContent?.trim()),
    restore() {
      (editable ?? focus).focus({ preventScroll: true });
      if (range) { selection?.removeAllRanges(); selection?.addRange(range); }
    },
    selectAll() {
      const all = document.createRange();
      all.selectNodeContents(scope);
      selection?.removeAllRanges(); selection?.addRange(all);
    },
  };
}

export async function performDesktopTextAction(target: DesktopTextTarget, action: "copy" | "paste" | "selectAll") {
  target.restore();
  if (action === "copy" && target.selection) await copyText(target.selection);
  if (action === "paste" && target.canPaste) await window.piDesktop?.paste();
  if (action === "selectAll" && target.canSelectAll) target.selectAll();
}
