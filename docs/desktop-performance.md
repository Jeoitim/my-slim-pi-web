# Desktop performance investigation — 2026-10-22

## User cold-start acceptance — 2026-10-25

After installing `.6`, the user reported multiple launches over the following two days and confirmed that cold-start speed meets expectations. This is real-use acceptance of the Windows installation, distinct from the isolated process-launch timings below. No new stopwatch measurements, reboot trace or Defender attribution were supplied, so the report does not assign a new cold-start duration or claim a precisely measured cold-start percentage.

The code remains at `0.12.2-jeoitim.6`, matching the tested installer. Source publication does not imply that a GitHub tag or release has been published.

## `.6` implementation and acceptance — 2026-10-23

Implemented in the previously proposed order:

1. A **portable resolution index**, generated with the bundled Node during an offline, empty-AgentRoot recording run. It matches packaged parent/request/conditions keys, rebases paths to the installation, and binds to Node/platform/arch/app-version/BUILD_ID. Unknown and external requests retain Node's resolver. Invalid or stale indexes fall back instead of preventing startup.
2. A **gzip startup source pack** for the CommonJS/ESM JavaScript actually loaded by that run. Node loads the original source using the same canonical URLs, so `import.meta.url`, resource lookups and SDK class identities remain correct. Native modules, JSON and user-extension code use the ordinary loader. Original files remain available for unknown paths, dynamic imports and fallback. This merges startup file reads without changing Pi or adding an Agent backend. The valid source-pack path skips independent per-module bytecode caches; `.compile-cache` is no longer distributed.
3. Evaluated static-frontend/API separation against the current profile. The homepage is already prerendered by Next (`○ /`); the dynamic API still owns Agent/SSE/terminal/authentication behavior. With the first two changes, the measured Next preparation phase is about 0.6 seconds in packaged warm launches. No API migration or duplicated security layer was introduced in this candidate; that architectural change is deferred pending evidence of a remaining Next bottleneck after real cold-start use.

Startup assets: 5,970 resolution entries / **1,358,885 bytes**, and 1,360 source modules / **2,331,531 compressed bytes**. Production readiness shows 5,053 resolution hits and 1,193 source-pack loads. The recorder includes additional modules needed by read-only startup routes after readiness. A direct SDK check confirms identical SessionManager, ModelRuntime and MCP factory identities against direct internal imports, and correct relocated SDK resource roots.

Native pruning removes 12 foreign-platform `node-pty` prebuild files / 12,118,680 bytes. The current x64 PTY is retained and tested after pruning. Other native assets, unknown directories and licenses remain.

### Controlled feature-switch comparison

Three sequential process launches per mode, with isolated empty profiles, against the same packaged `.6` executable:

| Run | Index/source pack enabled, UI interactive | Both disabled, ordinary-file fallback |
| --- | ---: | ---: |
| 1 | 2,767 ms | 3,205 ms |
| 2 | 2,114 ms | 3,553 ms |
| 3 | 2,108 ms | 3,052 ms |
| Median | **2,114 ms** | **3,205 ms** |

Median reduction: **34.0%**. Optimized backend readiness: 1,500 / 1,401 / 1,405 ms; Next prepare: 575 / 658 / 652 ms. The baseline retains the ordinary loader's compile-cache fallback. Logs: `.local/desktop-startup-six-optimized.json` and `.local/desktop-startup-six-baseline.json`.

Earlier staged backend-only experiments: ordinary loading median 1,847 ms, index-only median 1,109 ms, and index plus source pack with bytecode caching disabled median 940 ms. These are server-only warm measurements, not full UI measurements.

Neither set flushed OS caches or rebooted Windows; the first observed `.6` launch at 2.77 seconds does **not** prove the original 71.7-second naturally cold launch is fixed. Do not report that cross-run difference as a controlled cold-start speedup. The new native diagnostics distinguish Node/entry readiness, startup asset loading, Next loading/preparation, process CPU and full backend readiness. Sanitized history retains up to 20 launches in `app.getPath("userData")/startup-history.json` (normal installation: `%APPDATA%/My Slim Pi Web/startup-history.json`). No credentials, origins, session paths or source contents are logged.

### Artifact and compatibility verification

Local Windows installer: `dist-desktop/My.Slim.Pi.Web.Setup.0.12.2-jeoitim.6.exe`, **218,189,902 bytes**, plus SHA-256 sidecar. Payload contains **16,063 files / 837,148,965 bytes**. One extraction took 43,765 ms; this was not paired with a new `.5` control run, so do not claim an installation-time improvement percentage from it. No NSIS install/upgrade was executed, and the user's installed `.5` was not replaced.

Acceptance used the executable extracted from the actual NSIS payload at `.local/payload-six-1792730210400/app`, including a different installation root. Passed:

- 17 desktop tests covering relocation, conditional exports, canonical module identity, unknown dependency and external-extension fallback, corrupt/stale assets, source-pack fallback, native pruning and bounded sanitized startup history.
- Typecheck, changed-file ESLint, 8 permission/remote-boundary tests; the real My Slim Pi integration test remains skipped without its disposable fixture.
- Bundled-Node real PTY checks after native pruning, and SDK identity/resource-root verification against both staging and the extracted payload.
- Packaged UI: password login, signed entrance and Host boundaries, shared session content, single-instance focus, lazy file preview, real PTY input/output, visible loading handoff, idle close, a dynamic TypeScript extension's blocking dialog/background lifecycle, forced host termination and recovery.

The first E2E run exposed a test timing assumption: `sessionListVersion` can advance between sequential internal/external requests while their session content remains identical. The assertion now compares content and checks that the later revision is a valid nondecreasing number. No session API behavior was changed. The rerun passed.

No paid model request or public Cloudflare test was made. This candidate has not been published remotely. Full NSIS upgrade behavior, overnight/reboot-cold timing, Linux desktop and macOS remain outside this acceptance.

## Installed `.5` recheck — 2026-10-23

### Production mode, ASAR and plain `next start` verification

Direct inspection of the installed ASAR header finds **15 files, 43,087 payload bytes, 46,987 archive bytes and no `node_modules` path**. Its top-level entries are `electron` and `package.json`. Backend dependencies live outside ASAR under `resources/server/node_modules`; npm lives under `resources/runtime/node_modules`. There is no giant dependency archive being fully unpacked at application startup.

The installed build declares `output: standalone`, has a production `BUILD_ID`, and has no `.desktop/next/dev` tree. The desktop host uses a `--desktop-dev` opt-in flag; tested installed launches pass no such flag. The backend sets `NODE_ENV=production` and initializes `next({dev:false,...})` with the serialized production configuration. The build script runs `next build --webpack` beforehand. `prepare()` initializes the production server; its name does not mean a source build.

For an additional comparison, launched the installed production output with the bundled Node and the ordinary `next start` CLI, supplying the same serialized production config and disposable empty AgentRoots. No custom cache enablement or Electron was involved. Sequential warm runs:

| Run | CLI prints Ready | First complete HTML response |
| --- | ---: | ---: |
| 1 | 405 ms | 2,766 ms |
| 2 | 387 ms | 2,539 ms |
| 3 | 430 ms | 2,577 ms |

These are warm server-only timings, not hydrated-UI or cold-start comparisons. Merely replacing the custom bootstrap with the CLI does not eliminate initialization work; the Ready line precedes the first-page cost. The diagnostic script is `.local/plain-next-start.mjs`.

Static export cannot preserve the application's dynamic Agent/SSE/terminal/files/authentication API by itself. A static frontend can be considered separately, but removing Next from backend startup requires migrating the HTTP/API integration while keeping one Agent runtime and preserving the existing access controls; this is a larger architectural change.

The user reported a long loading page on the first launch, with fast launches within a few minutes of closing. This was reproduced against the overwritten installation at `C:/Users/timrt/AppData/Local/Programs/MySlimPiWeb`, using disposable empty profiles and AgentRoots. The earlier `.5` warm measurements did not establish that the first-launch problem was fixed.

| Launch | Load Next | Prepare Next | Backend ready | UI interactive |
| --- | ---: | ---: | ---: | ---: |
| First observed | 2,521 ms | **51,197 ms** | 69,772 ms | **71,657 ms** |
| Immediate second | 174 ms | 2,945 ms | 3,884 ms | 4,694 ms |
| Immediate third | 154 ms | 3,259 ms | 4,377 ms | 5,214 ms |

Report: `.local/desktop-startup-installed-20261023.json`. This is a naturally slow first observed launch, not a controlled reboot benchmark. Production configuration and cache code are present, `compileCache` reports `enabled`, no cache-disable override was inherited, and the installed server contains 16,184 files with zero `.d.ts`/`.d.mts`/`.d.cts` declarations. No evidence that the earlier declaration pruning was lost during upgrade was found. Enabled status alone is not a per-module cache-hit measurement.

Most of the delay is before the application page is opened. The first backend also spends approximately 16 seconds outside the recorded load/prepare intervals; the current timers cannot attribute that separately to executable startup, host entry loading, scheduling or listener setup. Add entry/IPC/process-CPU/I/O timestamps on the next iteration rather than labeling all of it Next initialization.

A diagnostic synchronous Node module-hook trace of subsequent warm backend launches records **6,752 resolutions, 2,670 module loads and 16,628,324 source bytes**. Resolution alone totals approximately 1.40–1.66 seconds with tracing enabled. These counts are loader events, not distinct files or physical disk operations. An allowlisted recorded-resolution prototype identifies 2,058 distinct resolved targets (407 Next files, 666 under Pi packages, 985 other dependencies). It retains the original files and module URLs.

### Diagnostic resolution-map experiment

The prototype was loaded externally through a temporary preload in `.local`; installed application source files were not patched. A recording pass maps successful `(parent URL, specifier, conditions)` resolutions inside the installed server root. The replay pass returns the same URLs through Node's synchronous resolver hook; unknown requests retain Node's normal resolver. This prototype is tied to the current installation path and is not production-ready.

| Backend-only warm run | Recording, ordinary resolution | Replay |
| --- | ---: | ---: |
| 1 | 2,789 ms | 1,404 ms |
| 2 | 2,623 ms | 1,376 ms |
| 3 | 2,803 ms | 1,255 ms |
| Median | **2,789 ms** | **1,376 ms** |

Replay records 5,929 resolution hits, no eligible misses, and about 41–48 ms of resolver-hook time. Recording itself has overhead; this is a small sequential diagnostic experiment with warm OS caches, **not a cold-start or full-UI speedup claim**. Reports: `.local/resolution-<pid>.json`; prototype `.local/trace-resolution-map.cjs`; path-specific map `.local/resolution-map.json`. Do not dump the large map into user-facing logs.

### Revised improvement order

1. **Precompute a portable resolution index at build time.** Index only immutable packaged application/dependency requests, key by parent/specifier/conditions, preserve canonical module URLs and package identities, and fall back for unknown requests. Bind it to the Node version, application version and build ID; rebuild on releases. Rebase installation paths, validate traversal boundaries, exclude user extensions and mutable project dependencies, and disable it in development. Test relocation, conditional exports, SDK dynamic imports, plugins, MCP, PTY, permissions, missing/stale maps and full installed UI before shipping. The diagnostic map is evidence for this direction, not the final implementation.
2. **Capture the next naturally slow launch.** Record native process launch, entry-ready IPC, CPU usage, resolution/read time, SDK import completion and first-page readiness. File-cache effects and security-filter overhead are plausible amplifiers, but neither has been isolated. Defender real-time and behavior protection are enabled on this machine; that does not establish causation. Microsoft's Defender performance analyzer can attribute scan costs if a suitably privileged recording is available. No exclusions or protection changes were made.
3. **Reduce eager SDK imports after profiling.** `instrumentation-node.ts` starts the entire SDK import during server initialization. Split lightweight browsing paths from session/extension initialization where compatible, and overlap SDK work with usable UI. Moving the wait to the model picker is not a complete fix: measure first usable session/model data too. Consider selected static bundles only if the resolution index leaves a substantial cold-file-read bottleneck; preserve SDK module identity and resource-relative paths.

The compile cache remains useful for JavaScript compilation, but cannot remove dependency resolution and source-file access. The primary next intervention should target those costs rather than merely generating more compile-cache files. No new production optimization or installer was produced during this recheck, and no personal Agent session or prompt was started.

Installed application: `C:/Users/timrt/AppData/Local/Programs/MySlimPiWeb`, version `0.12.2-jeoitim.4`.

Three sequential launches through `electron/scripts/startup-check.mjs --baseline`, each with isolated empty AgentRoot and userData:

| Launch | Backend ready | UI interactive |
| --- | ---: | ---: |
| First observed | 50,241 ms | 51,830 ms |
| Second | 3,199 ms | 3,852 ms |
| Third | 3,108 ms | 3,785 ms |

No error-page navigation. Initial scripts total 2,161,431 decoded bytes. Reports are in `.local/desktop-startup-before.json`. These are observed process launches, not a controlled reboot/disk-cache-flushed benchmark. Empty profiles exclude the user's extension/session configuration as a prerequisite for reproducing this delay.

The installed entry uses production Next output and serialized standalone configuration before loading Next. There is no application-wide TypeScript rebuild on startup. User TypeScript extensions can still be transformed by the SDK's jiti loader when a session loads them.

The delay is predominantly before backend readiness, not React hydration. Cold filesystem access and security scanning are plausible contributors, not proven causes: this run did not collect Windows disk/Defender traces. Subsequent backend-only measurements with the new phase instrumentation against installed resources show 96–107 ms loading Next and 1,839–2,125 ms preparing Next, with 2,526–2,867 ms total readiness. This warm measurement must not be substituted for cold-phase attribution.

Installed resources contain 26,363 server files (482 MiB rounded) and 1,930 runtime files (101.2 MiB). Production build staging currently installs the complete locked production dependency tree to preserve SDK dynamic imports. Next alone contributes 8,594 dependency files; OpenAI 3,548. Only the small Electron host is archived; the independent Node backend uses loose files.

Implemented first step: remove dependency `.d.ts`/`.d.mts`/`.d.cts` and JS/TS source maps from generated server staging after npm ci. A read-only inventory of this installation identifies **12,342 files / 151,255,928 bytes (144.2 MiB)** removable this way. Executable TS, package metadata, native binaries, licenses and extension assets remain. Tradeoff: installed third-party stacks lose source-map detail. This is an unpacked-resource saving, not a measured compressed-installer reduction or installation-time improvement.

The initial investigation added load/prepare phase timings and passed 10 desktop tests. It did not modify the installed `.4`.

The follow-up `.5` implementation adds a portable Node module compile cache, generated by the exact bundled Node 24.20.0. The generator loads the production backend and read-only startup routes with an empty temporary AgentRoot and offline mode, then deletes runtime HTML caches before packaging. It never creates an AgentSession or sends a model request. CommonJS/ESM relocation, correct relocated `import.meta.url`, changed-source invalidation and an unusable-cache fallback are covered by tests.

The seeded cache adds 2,071 files / 6,000,500 bytes. Runtime modules, SDK resource-relative paths and dynamic extension imports retain their original layout. Broad SDK bundling was not adopted because it can change module identity and the resource paths used by the SDK's dynamic internal imports.

The Windows installer was built locally as `dist-desktop/My.Slim.Pi.Web.Setup.0.12.2-jeoitim.5.exe`, with a SHA-256 sidecar. Size: **220,419,874 bytes**, versus the supplied `.4` installer's **250,675,512 bytes** (12.1% smaller). Nothing has been published remotely or installed over the user's `.4`.

Three new-process launches with empty isolated profiles, against the packaged `.5`:

| Launch | Cache enabled, UI interactive | Cache disabled, UI interactive |
| --- | ---: | ---: |
| First | 3,795 ms | 3,453 ms |
| Second | 2,892 ms | 3,142 ms |
| Third | 2,786 ms | 3,279 ms |
| Median | **2,892 ms** | **3,279 ms** |

Cache-on median is 11.8% lower in this small sequential comparison. Reports: `.local/desktop-startup-after.json` and `.local/desktop-startup-after-no-cache.json`. The `.4` baseline median was 3,852 ms, but these runs happened at different times and OS-cache states, so do not attribute the entire difference to this change. In particular, the original 51.8-second first observation versus the new 3.8-second first observation is **not a controlled cold-boot comparison**. A reboot benchmark or Windows trace remains necessary to explain and verify that worst case.

Verification already completed: isolated production build, bundled real PTY smoke test, typecheck, changed-file ESLint, 12 desktop unit tests, and 8 permission/remote-boundary tests (1 real My Slim Pi integration test skipped without its disposable fixture). The actual missing-runtime/Retry-window check also passed.

## Installer payload comparison and packaged acceptance

Ran `installer-payload-check.mjs` after build/startup tests finished, without a concurrent build or app test. It extracts `$PLUGINSDIR/app-64.7z` from each NSIS installer and times application payload extraction into new disposable directories. Neither installer is executed.

| Metric | Supplied `.4` | Candidate `.5` | Reduction |
| --- | ---: | ---: | ---: |
| Payload extraction | 97,044 ms | 67,234 ms | **30.7%** |
| Extracted files | 28,368 | 18,143 | **36.0%** |
| Extracted bytes | 999,737,187 | 851,560,034 | 14.8% |
| Installer bytes | 250,675,512 | 220,419,874 | **12.1%** |

Report: `.local/installer-payload-019f787b-2c73-4cb3-9aeb-6162f2706b90/report.json`. This is a single sequential pair, with OS caches unflushed. It measures decompression and file creation, **not full installation/upgrade**: registry entries, shortcuts, old-version removal and installation UI are excluded. A preliminary `.4` extraction overlapped the build and took 170,346 ms; it is excluded from the comparison above.

The executable used for final acceptance was the actual `.5` payload extracted from the new installer, rather than only the build staging directory. Passed:

- Packaged desktop E2E: password login, signed internal/external entrance boundaries, exact Host restrictions, same-instance focusing, settings, shared session reads, lazy file preview and a real PTY command.
- Visible loading-page handoff and clean idle-window close.
- A fresh **TypeScript** extension with a type-only SDK import, a blocking dialog, active-task detection, keep-in-background and task shutdown/exit. This verifies dynamic TS extension loading after declaration pruning and cache seeding.
- Forced host termination, owned backend cleanup, single-instance recovery and normal quit.

The user's installed `.4`, credentials and sessions were not replaced or changed. No paid model request was made. Actual NSIS upgrade installation, reboot-cold timing, Linux/macOS desktop behavior and public Cloudflare access are not claimed as tested here.

Further investigation:

1. Profile the next naturally cold launch with Windows disk/CPU/security-provider traces to identify the slow modules and reads. Do not flush system caches or change antivirus exclusions as a default optimization.
2. Consider selected static-dependency bundles only if profiling justifies the compatibility cost; retain dynamic Pi extension loading and native modules outside the bundle. Do not blindly replace the dependency tree with Next tracing alone.

Putting the backend into Electron ASAR is not directly compatible with the present independent stock Node runtime; Electron supplies the special filesystem support. Switching runtimes would require revisiting Node ABI, node-pty and security/lifecycle checks. A zip extracted on first launch only moves installation work into the startup path.
