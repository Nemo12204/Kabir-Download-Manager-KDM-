# Kabir Download Manager(MADE WITH AI)

A free, native Windows download manager built with C# / .NET 8 / WPF. MIT licensed, with no third-party runtime libraries.

## Run

Open `artifacts\KDM\KabirDownloadManager.exe` after building. The published folder includes the .NET runtime; keep its files together. Windows 10/11 x64 is the default target. Windows 11 supplies native rounded window corners through DWM.

Paste an HTTP/HTTPS URL and choose **Add download**. Files go to `Downloads\KDM`; change that in **Settings**. Each row supports pause, resume/retry, opening completed files, and removal. Removing a completed entry keeps the downloaded file. Existing destination files are never overwritten. **Ctrl+L** focuses URL entry; **Escape** closes settings.

KDM resolves automatic filenames when a queued transfer starts: it prefers the server's `Content-Disposition` (`filename*` for Unicode, then `filename`), followed by the final redirected URL. Recognized MIME types supply missing extensions such as `.rar`, `.zip`, or `.mp4`, and replace generic URL script suffixes such as `.php`. Names are sanitized for Windows and collisions receive numbered suffixes. An explicitly supplied filename takes priority. If neither response metadata nor the URL identifies a type, KDM cannot infer the original extension.

### System tray

Closing or minimizing the window hides KDM beside the Windows clock and keeps downloads running. The orange icon may be under Windows' hidden-icons arrow. Double-click it to restore the window, or right-click for **Show KDM**, **Pause all**, **Resume all**, and **Exit KDM**. Exit saves checkpoints/history and stops the app. Opening KDM again or clicking **Open KDM** in the extension restores the existing instance.

`KabirDownloadManager.exe --tray` starts in the tray. `KabirDownloadManager.exe --exit` requests graceful exit of the current instance. The browser bridge starts the desktop in the tray for background requests.


## Browser integration

1. Build the app or extract the portable package into a permanent folder.
2. Double-click **Install-Browser.cmd** beside the app. It registers the native host for your Windows account and opens the extension folder. The command-line equivalent is `powershell -ExecutionPolicy Bypass -File .\tools\Register-Browser.ps1`.
3. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, select **Load unpacked**, and choose KDM's `browser` folder. Pin **Kabir Download Manager** to the toolbar.
4. Open the popup: **Desktop connected** confirms the bridge is working. Leave **Automatically download in KDM** enabled, then click download links normally. Use **Open KDM** to restore the tray app. Right-click downloads, pasted URLs, and detected direct video/audio are also supported.

### Automatic capture

Capture is enabled by default. When Chrome/Edge starts an HTTP/HTTPS file download, the extension holds filename completion and pauses the browser transfer, then sends its final URL and suggested filename to KDM. Once KDM confirms the queue entry is saved, the browser transfer is cancelled. A cancelled entry may briefly appear in the browser Downloads list; the file downloads into KDM's configured folder. Holding filename completion prevents tiny files from finishing twice.

If the desktop connection or queue handoff fails, the extension resumes the original browser download. Acceptance means **queued and saved**, not that the remote transfer has completed. Errors after acceptance (for example, expired links or login requirements) appear in KDM for retry; they do not restart a second browser copy. Turn off **Automatically download in KDM** before clicking a link to download it with the browser instead. This setting is saved across popup and browser restarts.

Automatic capture leaves browser-local `blob:`/`data:` exports, detected POST requests, adaptive playlists, and downloads initiated by other extensions in the browser. It acts on actual browser downloads, not ordinary navigation links or streaming playback. Browser credentials are not copied; for downloads requiring a browser login, disable capture first.

**Updating from 1.1:** open `chrome://extensions` or `edge://extensions`, reload KDM (and re-enable/approve the added **Manage your downloads** permission if prompted). If it is not installed yet, use **Load unpacked** with `artifacts\KDM\browser`. The extension must be enabled for automatic capture to work.

`artifacts\KDM-browser-extension.zip` contains the standalone unpacked extension. Extract it before using **Load unpacked**. The native desktop app and registration are still required. The bundled public manifest key fixes the extension ID to `lenkdpljabbkcfbnhlhoacbllpinjika`; no manual ID entry is needed.

The bridge starts KDM when necessary. Registration is specific to the executable's location; rerun the registration script if you move the published folder. Remove registration with `tools\Register-Browser.ps1 -Unregister`. A separately signed/repackaged extension can supply its own `-ExtensionId`.

The browser bridge uses native messaging, followed by a same-user named pipe. It opens no TCP listener. The extension observes response metadata, supports explicit link handoff, and captures new downloads while automatic capture is enabled. Browser cookies, authorization headers, POST bodies, and account sessions are not transferred. A URL that requires those credentials must be downloaded with the browser or made directly downloadable by its server.

HLS/DASH manifests are identified and labeled in the popup, with a copy-URL action. Manifest assembly, live recording, and audio/video remuxing are not implemented. A direct MP4/WebM/MP3 file downloads normally. `blob:` URLs are browser-local handles and cannot be downloaded as remote files.

## Transfer behavior

- A `GET` with `Range: bytes=0-0` checks actual byte-range support.
- Automatic naming uses a cancellable metadata probe before transfer validation. The chosen destination is saved before data transfer and retained across pause/restart; ID-based partial-file paths stay stable.
- A bounded worker pool bisects the largest remaining interval when a worker becomes available. Completed workers can steal the tail of an active segment.
- Up to 8 connections per download and 3 simultaneous downloads by default; both are configurable.
- Exact `206` / `Content-Range` / content-length checks, identity encoding, strong ETag validation, `If-Range`, and qualified Last-Modified fallback prevent byte mixing.
- A non-range server or a resource without a strong validator uses one streaming request. Such resources restart from byte zero on resume.
- Retryable network failures, HTTP 408/429/5xx, timeouts, and `Retry-After` are handled with bounded retries. Disk errors and invalid server ranges surface as failures.
- File positions are checkpointed every two seconds and on pause. Data is flushed before the JSON checkpoint is atomically replaced. On resume, changed metadata or an invalid checkpoint triggers a fresh transfer.
- Completion computes SHA-256, closes the partial file, and renames it into place without overwrite. The digest records the downloaded bytes; it is not a comparison against a publisher-supplied checksum.

Connection count is a ceiling, not a guaranteed speed multiplier. Server throttles, network capacity, and disk throughput still bound transfer speed.

## Storage

History and settings: `%LOCALAPPDATA%\KabirDownloadManager\library.json`.

Partial data and resume map: `.<download-id>.kdm.part` and `.<download-id>.kdm.part.json` alongside the destination. Keeping partial data on the destination volume permits an atomic final rename. Interrupted downloads reopen as paused. `KDM_DATA_DIRECTORY` overrides the library location for isolated testing.

URLs, including any signed query parameters they contain, are persisted in the local library. Completed hashes appear in the file tooltip. The app performs no telemetry.

## Source map

| Path | Responsibility |
|---|---|
| `src/Kdm.Core/DownloadEngine.cs` | HTTP probe, scheduling, retries, checkpointing, completion |
| `src/Kdm.Core/NativeProtocol.cs` | Bounded UTF-8 JSON framing |
| `src/Kdm.App/DownloadManager.cs` | Queue, per-download cancellation, history/settings |
| `src/Kdm.App/MainWindow.xaml` | Frameless dark desktop UI |
| `src/Kdm.App/Theme.xaml` | Custom button, textbox, list, grid, scrollbar, progress templates |
| `src/Kdm.App/App.xaml.cs` | Single instance and same-user pipe server |
| `src/Kdm.NativeHost/Program.cs` | Browser stdio to desktop pipe bridge |
| `browser/` | Chromium MV3 integration |
| `tests/` | HTTP fixtures and real desktop integration checks |
| `docs/IDM-ANALYSIS.md` | Installed IDM architecture findings and evidence |

The architecture report is based on inspection of the locally installed IDM build and its published segmentation description. KDM contains independently written code and does not load IDM components.
