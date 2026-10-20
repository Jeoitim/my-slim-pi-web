function isAppUrl(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && ["/", "/login"].includes(url.pathname) && !url.username && !url.password;
  } catch { return false; }
}
function externalLink(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return null;
    // Internal listeners and credentials must never be handed to a browser.
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function assertSender(event, window, origin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame || !isAppUrl(event.senderFrame.url, origin)) {
    throw new Error("Desktop access denied");
  }
}
module.exports = { isAppUrl, externalLink, assertSender };
