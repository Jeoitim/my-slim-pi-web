const MAX_CLIPBOARD_TEXT_LENGTH = 16 * 1024 * 1024;

function validateClipboardText(value) {
  if (typeof value !== "string" || value.length > MAX_CLIPBOARD_TEXT_LENGTH) throw new Error("Invalid clipboard text");
  return value;
}

module.exports = { validateClipboardText, MAX_CLIPBOARD_TEXT_LENGTH };
