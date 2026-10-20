document.getElementById("retry").addEventListener("click", async event => {
  event.target.disabled = true;
  document.getElementById("status").textContent = "正在连接 / Connecting…";
  try { await window.piDesktop.retryService(); }
  catch { document.getElementById("status").textContent = "启动失败。请检查运行时与桌面资源，或重新安装应用。 / Startup failed. Check the runtime or reinstall."; }
  finally { event.target.disabled = false; }
});
