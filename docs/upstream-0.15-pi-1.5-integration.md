# Pi 1.5 / Web 0.15 integration handoff

The integration branch `codex/integrate-upstream-0.15-pi-1.5` merges Pi Web `f130910abf662b506b2ef2f475fc21a2fe57badc` (release 0.15.0) into fork commit `d0727f4`. The upstream mirror remains a clean copy. The intended release version is `0.15.0-jeoitim.1`; the validated `0.13.0-jeoitim.2` installer is an earlier, separate release.

## Compatibility

- Pi SDK packages, including `pi-schema`, are pinned to 1.5.0. Pi 1.5 fixes the upstream HTML export recursion, so the old forced template patch was removed; the bounded worker and isolated history viewer remain. A real export was rendered in Chromium.
- A side chat in a managed My Slim Pi installation copies the parent session's current `timrt-permissions` mode when created. The side chat runs the normal CLI tools, extensions and permission hooks; subsequent mode changes remain local to each session. Non-managed installations retain upstream side-chat restrictions.
- The fork's selected-text “Ask in new chat” flow remains alongside upstream side chats. Process folding and the phone settings navigation were retained and checked in both languages.
- MCP connection readiness is published only after the initialization notification has actually been sent; a delayed-notification regression covers this ordering.

## Validation

- Typecheck, lint, 26 desktop unit tests, and the real CLI 1.5 integration (all four permission modes, side-chat inheritance, approval/refusal and restored sessions) passed. The complete automated suite passed 3,290 tests, with 25 skipped and no failures.
- The Windows test process used Scoop Git Bash at the front of PATH, without changing the user's machine or app configuration. The machine's current global MCP entries had no shell-substitution values requiring that change.
- Production desktop build and source-pack coverage passed with zero individual module source reads; Next's three generated client-reference manifests were counted separately. BUILD_ID `cpeYkVHoEKW_ApNJJ-Cx-`.
- Installer `My.Slim.Pi.Web.Setup.0.15.0-jeoitim.1.exe`: 293,201,553 bytes, SHA-256 `fd7ed71f0efd59eb8821f8c5a59e7fc6162e1b52bab4ad0d7cef01c58283f89a`, BUILD_ID `cpeYkVHoEKW_ApNJJ-Cx-`; its Windows integrity level was verified as Medium. Its embedded ZIP passed 7-Zip integrity verification (7-Zip reports the expected NSIS wrapper as trailing data); the extracted executable digest matches the copy used for native acceptance. This does not claim an actual upgrade of the user's installed application. The earlier `0.13.0-jeoitim.2` installer was preserved, SHA-256 `ab9ee22e14c7602f2f10e2e5994e57ef1a221c6913647db95d8adfd4fb279283`.
- A temporary project-trust test directory at `C:\Users\Public\pi-web-trust-test-20261105` remains because automatic approval rejected its cleanup.
- Packaged desktop acceptance passed with sandbox and context isolation enabled: authentication and remote-access checks, settings, single-instance behavior, files and terminal entry. Native terminal tests passed actual keyboard input in PowerShell 7, Windows PowerShell, Command Prompt and Git Bash, plus offline loopback, reconnect and restoration.
- Packaged native checks passed for the isolated full-history viewer, right-click selection and clipboard behavior, and the startup loading page. These ran from a disposable copy under LocalAppData to avoid the workspace's Low integrity label; the application sandbox remained enabled.

- The legacy repair helper passed isolated long-path, preservation and junction-refusal checks under Windows PowerShell and PowerShell 7. The first installer build failed because the low-integrity build process could not use a medium-integrity TEMP directory; a low-integrity build-only TEMP and a temporary electron-builder environment preload allowed the retry to complete without modifying dependencies.
