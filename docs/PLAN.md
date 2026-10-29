# KDM design and implementation plan

## Design

Native .NET 8 WPF application with a charcoal shell, orange/yellow accents, custom control templates, a resizable rounded frameless window, category navigation, URL entry, and a virtualized downloads grid. The transfer engine is an independent .NET library. The desktop owns queue/history/settings. An optional Chromium extension sends direct links and detected media through native messaging to a same-user named pipe.

The engine uses HTTP byte ranges, a bounded worker pool, largest-remaining-range bisection, pooled connections, offset-based writes, representation validators, atomic durable checkpoints, cancellation, bounded transient retries, and SHA-256 of completed files. A server without validated range support uses one streaming connection. Resume never combines different representations. Completion never overwrites an existing destination.

## Ordered work

- [x] Record installed IDM versions, hashes, extension calls, native-host imports and driver evidence in `docs/IDM-ANALYSIS.md`; distinguish observed mechanisms from unrecovered implementation details.
- [x] Create `src/Kdm.Core` and executable integration checks in `tests/Kdm.Tests`; verify exact bytes for segmented, sequential, interrupted/resumed, changed-resource, malformed-range, retry, empty-file, and filename-collision cases against a local HTTP server.
- [x] Implement `src/Kdm.App`: persistent queue, three concurrent downloads, per-download cancellation, progress/speed/ETA, error/retry UI, folder selection, category filters, settings, safe shutdown, and custom XAML theme.
- [x] Implement `src/Kdm.NativeHost` and `browser`: bounded native-message frames, same-user pipe IPC, link context menu, media discovery popup, registration script.
- [x] Build release, run integration checks, launch and inspect WPF, verify the native-host framing round trip, and publish a self-contained Windows x64 folder.

## Verification commands

```powershell
dotnet run --project tests/Kdm.Tests -c Release
dotnet build src/Kdm.App -c Release
dotnet build src/Kdm.NativeHost -c Release
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

SDK: .NET 8. No third-party runtime libraries. Direct HTTP/HTTPS media is supported; adaptive manifests are identified explicitly instead of being presented as finished video files.

## Browser extension and tray update

Use the existing Chromium MV3 extension and native-message bridge. Add an Open KDM action, desktop connection feedback, extension icons, and a double-click setup launcher beside the published executable. Registration remains per-user; the user loads the unpacked extension from Chrome/Edge's extensions page.

Use the Windows Forms `NotifyIcon` included with the Windows Desktop runtime. KDM's main window owns and disposes its icon. Minimize and close hide the window and taskbar entry while the queue and browser pipe continue running. Double-click/Show restores the previous window state; Pause all, Resume all, and Exit are available in the tray menu. Exit awaits checkpoint/history persistence. Browser-initiated background startup uses `--tray`; `--exit` permits graceful scripted shutdown of an existing instance.

Verification: real WPF tests exercise hide/restore, download completion while hidden, pause/resume, and explicit exit. Extend the real Chrome test for the popup controls and native-message handoff, and the published native-host test for hidden startup, activation, and graceful exit. Rebuild and package the desktop app and a standalone extension archive.

Implemented and verified in version 1.1; results are recorded in `docs/VERIFICATION.md`.

## Automatic browser capture — version 1.2

Use `downloads.onDeterminingFilename` as the single handoff entry point: return true and delay `suggest()` until handoff finishes. Chrome guarantees the download cannot complete until every listener suggests, preventing small-file duplication. Pause before submitting the final HTTP/HTTPS URL and basename through the existing native bridge; cancel after durable queue acceptance, resume on rejection/connection failure, and always release the filename callback. Do not retry an accepted add.

Persist a default-on `autoCapture` setting in local extension storage and expose a labelled popup switch. Keep a bounded, two-minute session list of non-GET request URLs to avoid replaying observed POST exports as GET. Leave browser-local URLs, adaptive playlists, other extensions' downloads, and already-paused/inactive downloads intact.

Real Chrome fixtures cover ordinary links, redirects, a one-byte file, popup-setting persistence, unavailable native host, POST exports, blob exports, exact bytes, browser cancellation, and duplicate queue entries. Use ordinary download-directory preferences: DevTools' `Browser.setDownloadBehavior` override bypasses extension filename listeners.

API contract: https://developer.chrome.com/docs/extensions/reference/api/downloads#event-onDeterminingFilename (consulted 2026-10-29).
