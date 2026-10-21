export async function copyText(text: string): Promise<void> {
  if (typeof window !== "undefined" && window.piDesktop?.writeClipboardText) {
    await window.piDesktop.writeClipboardText(text);
    return;
  }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Older browsers or denied Clipboard API: try the user-initiated fallback. */ }
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard write failed");
  } finally {
    ta.remove();
    active?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
