# Verification record

Date: 2026-10-28. Windows x64. SDK 8.0.427. Chrome 156.0.8078.73. Node.js 24.22.1.

## Verified

| Check | Result |
|---|---|
| Release build of WPF app | Passed; 0 warnings, 0 errors |
| Release build of native host | Passed; 0 warnings, 0 errors |
| HTTP/core executable suite | 13 checks passed |
| Real WPF desktop suite | Queue concurrency, pause-all, unique destinations, completion, persistence, filters, settings validation passed |
| Real WPF rendering | 1220×780 and 980×640; zero binding errors; screenshots inspected |
| Published native-host integration | Stdio frames → app startup → same-user pipe → HTTP download; exact output bytes; invalid URL rejected; clean EOF exit |
| Chromium MV3 extension | Loaded in isolated Chrome; stable ID verified; real local audio response discovered |
| Extension popup document | Detected media rendered; no observed JavaScript exceptions; screenshot inspected |
| Self-contained publication | Both executables and Windows x64 runtimes published to `artifacts/KDM` |

### Core checks

1. Parallel byte ranges with exact reconstructed bytes and SHA-256.
2. Server ignoring Range: sequential fallback.
3. Transient HTTP 503 retries.
4. Interrupted response body: retry from committed offset.
5. Missing representation validator: single-stream fallback.
6. Empty file.
7. Pause/checkpoint/resume with downloaded-prefix reuse and checkpoint cleanup.
8. Changed ETag and bytes: restart without combining representations.
9. Invalid Content-Range: reject without publishing a destination.
10. Destination collision: preserve existing file.
11. Unsafe URL and Windows filename handling.
12. Native-message Unicode framing, EOF, oversized/truncated frame rejection.
13. Corrupted checkpoint recovery.

### Reproduction

```powershell
$dotnet = "$env:LOCALAPPDATA\Temp\opencode\dotnet8\dotnet.exe"
& $dotnet run --project tests/Kdm.Tests -c Release
& $dotnet run --project tests/Kdm.DesktopTests -c Release
.\build.ps1 -Dotnet $dotnet -SkipTests
& $dotnet run --project tests/Kdm.Tests -c Release -- --native-host artifacts/KDM/Kdm.NativeHost.exe
.\tools\Register-Browser.ps1
node tests/browser-test.mjs
```

Screenshots: `artifacts/screenshots/kdm-desktop.png`, `kdm-desktop-minimum.png`, `kdm-browser.png`.

## Filename regression fix — 2026-10-28

The new desktop regression failed against the original implementation: the server supplied `Release Bundle.rar`, but KDM saved `archive-header`. Automatic naming now reads response metadata before selecting the destination.

The expanded desktop checks passed for:

- `Content-Disposition` filenames, preferred UTF-8 `filename*`, and malformed extended-name fallback.
- RAR MIME extension fallback, URL script suffix replacement, redirected filenames, and HTTP 200 sequential responses.
- Windows path sanitization, archive categorization, explicit-name preservation, concurrent reservations, and existing-file collisions.
- Persisted resolved names, cancellation while awaiting filename headers, and unresolved-name recovery after restart.
- Pause/restart of a server-named transfer: same partial/checkpoint paths, resumed range offset, and exact completed bytes.

The published native-host check also submits an archive URL without an explicit name and verifies the server-named file's bytes. The 13 existing core checks continue to cover transfer correctness.

## Browser extension and system tray — version 1.1

The initial new checks failed against the previous build: minimizing did not remove the taskbar entry, and the extension had no Open KDM action.

After implementation, the full build script passed the 13 core checks, expanded desktop suite, and self-contained publication. The desktop suite verified minimize/close to tray, restoring the taskbar entry and maximized state, exact-byte completion while hidden, and explicit exit with a durable checkpoint and no active workers. The WPF window owns and disposes a Windows `NotifyIcon` with Show, Pause all, Resume all, and Exit commands.

The published native-host check verified hidden browser startup, activation of the existing window, continued process operation after closing to tray, downloaded bytes, response-derived archive names, and graceful `--exit` shutdown.

The real Chrome test used an isolated profile and library with the registered native host. It verified the extension's stable ID, actual media discovery, connected status, hidden tray startup, a popup-initiated download with exact fixture bytes, and the Open KDM action. The updated popup screenshot was inspected. The Windows user's native-host registration points to `artifacts/KDM/Kdm.NativeHost.exe`; loading the extension in their personal browser is a manual Developer mode / Load unpacked step.

Distribution includes `Install-Browser.cmd`, the `browser` folder, and `artifacts/KDM-browser-extension.zip`. No third-party notification-area library was added; tray support uses the Windows Desktop runtime's Windows Forms implementation.

## Automatic browser capture — version 1.2

Verified 2026-10-29 with the isolated real-Chrome fixture and published native host. The initial new check failed because the default-on capture switch was missing. During integration, Chrome's DevTools download-directory override was found to bypass extension filename events; the fixture now uses normal Chrome profile preferences.

- Ordinary link click and redirected attachment: exact bytes downloaded by KDM, browser record cancelled, no browser output file.
- One-byte attachment: held at filename determination until KDM accepted it; no completion race or duplicate queue entry.
- Popup toggle: disabled capture saves in the browser, persists after popup reload, and can be re-enabled.
- Native-host failure: the isolated worker routes `add` to a deliberately nonexistent host, producing a real Chrome native-messaging error. The browser completes the original download with exact bytes and is not left paused; KDM receives no entry.
- POST export and browser-local blob export: exact files saved in the browser, with no KDM entry.
- Final library: exactly four distinct URLs (manual media plus three captures), each added once.
- Popup screenshot inspected; no horizontal overflow, observed JavaScript exceptions, or console errors.
- Full build script: 13 core integration checks, real WPF filename/tray suite, and self-contained publication passed.
- Published native-host smoke suite: tray startup/activation/close, exact-byte downloads, server filenames, invalid-URL rejection, and clean exit passed.

The downloads API acknowledges queue acceptance, not remote transfer completion. The browser fallback covers failed handoff; failures after acceptance remain visible in KDM. Personal-browser extension reload and approval of the added downloads permission are manual steps.

## Evidence boundaries

Native IDM disassembly was blocked by IDA's missing valid license. The architecture report explicitly labels the resulting static observations and published algorithm description. KDM's own source and tests are executable independently of IDM.

These checks cover the implemented HTTP downloader and desktop workflows. They do not establish full feature parity with IDM, HLS/DASH assembly, multi-day soak stability, authenticated browser-session transfer, or behavior under a physical power failure. A completed-file SHA-256 is a digest of the obtained bytes, not a remote authenticity assertion.

The local user-level NuGet configuration had no sources. A project-scoped `NuGet.Config` supplies nuget.org so self-contained runtime packs can be restored without changing the user's NuGet configuration.
