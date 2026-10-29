# IDM architecture: observed mechanisms and KDM blueprint

## Scope and evidence

Inspected on 2026-10-28: `C:\Program Files (x86)\Internet Download Manager`. This report combines local manifests, extracted bundled extension JavaScript, parsed PE import tables, binary strings, live Windows service/socket observations, and IDM's own segmentation documentation. It is not a claim to have recovered IDM's complete native source or its scheduler's function bodies.

IDA's headless service disconnected on open; the GUI could not register. A direct `idat.exe -B` invocation identified the blocker: **Cannot continue without a valid license**. No successful native disassembly/decompilation is claimed. `tools/Inspect-Idm.ps1` reproduces the static import/string/manifest inspection without changing the install directory. Raw extracted files remain in `%LOCALAPPDATA%\Temp\opencode\idm-evidence`.

### Installed binary identities

| File | File version | Bytes | SHA-256 |
|---|---|---:|---|
| `IDMan.exe` | 6.43.16.2 | 6,490,992 | `3B5DC9CE53EB31933EFFA3FD973BEC068A78E0F8C1D15A919B081F0C4D9325BA` |
| `IDMMsgHost.exe` | 6.38.20.9 | 39,168 | `DBA25A49ADB88F675DB26D2DC7A0FA9D4A5DB2326858CB9D2515F6F34B8E0B65` |
| `IDMNetMon64.dll` | 6.43.16.372 | 584,048 | `74523BEDC3450E1E7C1717442A0ED0E59C67794F53FEF7796B47328DC8449C36` |
| `IDMVMPrs64.dll` | 6.42.21.24 | 410,568 | `6FF10A3025E0E74BBE9FD99EA21BDAA20A32C94E13145B8805ACC82CF1229F5F` |
| `idmwfp64.sys` | 6.43.1.91 | 187,064 | `8ACFFB0181146E96C44A94C5B364D657B775936EBB4D0FCCE591068F74803C4A` |

## 1. Segmented downloading and dynamic splitting

### Confirmed public algorithm

IDM documents an **in-half division rule**. When a connection becomes available, it finds the largest remaining segment and splits the unfinished interval in two. When a connection finishes, it can take an unstarted neighboring segment or divide another connection's large unfinished interval. Small remaining intervals are left alone. It also documents connection reuse and periodically saving file positions for resume.

Source: [IDM: Dynamic Segmentation and Performance](https://www.internetdownloadmanager.com/support/segmentation.html), retrieved during this inspection.

### Local binary corroboration

`IDMan.exe` contains these HTTP format strings:

```text
Range: bytes=%I64d-
Range: bytes=%I64d-%I64d
Range: bytes=0-%I64d
Content-Range:
If-Range:
```

It also contains `SSL_read`, `SSL_write`, and their associated error strings; the install includes `libssl.dll` and `libcrypto.dll`. These support byte-range and TLS-capable transfer paths. Strings alone do not reveal lock strategy, native worker count, scheduler thresholds, file layout, or exact call graphs.

### KDM's independently implemented equivalent

1. Probe with `Range: bytes=0-0`, identity encoding, and a headers-first response.
2. Require a valid `206` and total length before considering parallel byte ranges. Require a strong representation validator for mixing responses.
3. Maintain half-open intervals `[start, end)` with a committed `next` position. A worker claims an idle interval; otherwise it bisects the largest active interval's unread tail.
4. Perform asynchronous network reads and explicit-offset writes. A worker rechecks interval ownership after every read, so a concurrent split cannot cause overlapping writes.
5. Reuse the HTTP handler's connection pool. Reuse of a particular underlying socket is conditional on response draining and server behavior; it is not guaranteed when an active response's tail is abandoned after splitting.
6. Validate the exact requested range, resource length, encoding, and validator before writing. Do not append a server's full `200` response to a range offset.
7. Flush data before publishing resume offsets; validate the interval map on load. If the remote validator changes, restart rather than combining old and new bytes.
8. Compute SHA-256 and rename the completed partial file to its final path.

The KDM values of 8 connections and a 512 KiB minimum splitting unit are KDM choices, not recovered IDM constants.

## 2. Browser-to-desktop transports and ports

Both inspected browser packages are version **6.43.1**. `IDMGCExt.crx` contains a Manifest V3 service worker; `idmmzcc3.xpi` contains a Manifest V2 Firefox background script.

### WebSocket path: port 1001

The Chromium script's line 11 and Firefox script's line 11 contain two endpoint candidates:

```text
127.0.0.1:1001
0.1.0.1:1001
```

Chromium `background.js` line 37 and Firefox line 31 construct:

```text
ws://<candidate>/?cid=<client-id>&rnd=<random>
Sec-WebSocket-Protocol: plugin.v3.internetdownloadmanager.com
```

The scripts cycle through these candidates and a native-messaging option. `0.1.0.1` is an IDM special candidate; it is **not** a standard loopback address. Its exact interception/routing behavior was not traced.

`IDMNetMon64.dll` independently contains the endpoints, subprotocol, WebSocket upgrade/header strings, and `WS2_32.dll`. Live inspection returned `127.0.0.1:1001`, state `Listen`, owning PID **4**. This establishes the observed listener, not a native call trace identifying which specific component created it.

The extension serializes its own command records, with sequence numbers and numeric fields, into these transports. Native messaging does not imply that IDM's inner application protocol consists of friendly JSON objects; the inspected script posts serialized strings. A full command-schema reconstruction was not performed.

### Native messaging path: no TCP port

`IDMMsgHost.json` explicitly declares:

```json
{"name":"com.tonec.idm","type":"stdio","path":"IDMMsgHost.exe"}
```

It restricts Chromium origins to `ngpampappnmepgilojfohadhhmbhlaek` and `llbjbkhnmlidjebalopleeepgdfgcpec`. The Firefox manifest allows `mozilla_cc3@internetdownloadmanager.com`.

`runtime.connectNative("com.tonec.idm")` causes the browser to start the host and exchange UTF-8 JSON values framed by a four-byte native-endian length (little-endian on this Windows machine) over stdin/stdout. No localhost TCP port is involved in this path.

`IDMMsgHost.exe` imports `GetStdHandle`, `ReadFile`, `WriteFile`, `CreateFileW`, and overlapped/event primitives. The host and `IDMan.exe` contain `\\.\pipe\IDMNetworkMonitor.`; `IDMNetMon64.dll` contains `\\.\pipe\IDMNetworkMonitor.%u`. This is strong static evidence for named-pipe IPC beyond the host. The `%u` suffix's precise meaning and message structs remain unrecovered.

Source for browser framing semantics: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), retrieved during this inspection.

### KDM transport

The bundled extension uses `com.kabir.kdm`, four-byte little-endian UTF-8 JSON frames, a 64 KiB message cap, and a separate `Kdm.NativeHost.exe`. The host forwards to a same-user named pipe and starts the WPF app if needed. KDM defines its own small `add` / `activate` / `ping` protocol and does not depend on IDM's inner protocol or listener.

## 3. Media detection and network integration

### Browser-side observation

The inspected extensions register `webRequest.onBeforeRequest`, `onBeforeSendHeaders`, `onHeadersReceived`, `onResponseStarted`, and related redirect/error events. The Firefox package has blocking webRequest permission; the Chromium MV3 package also has `declarativeNetRequest`, `downloads`, `scripting`, `cookies`, and `proxy` permissions. Permissions establish available capabilities, not that every capability is used for every transfer.

The response classification code examines `Content-Type` and `Content-Disposition`. Its MIME tables include MP4/WebM, transport-stream formats, M3U8, and MPD. Content scripts observe `video`, `audio`, `object`, and `embed` elements, use `MutationObserver`, track media source URLs, and exchange page/frame information with the background script. `document.js` provides page-context instrumentation through window messages. This explains how a download panel can be associated with a player and its requests.

Browser observation can see request URLs and headers at the browser's HTTP layer even for HTTPS. A generic packet filter below TLS does not obtain plaintext HTTPS URLs merely by seeing packets.

### Windows network components

`idmwfp.inf` identifies an IDM WFP driver with service name `IDMWFP`, auto start, dependency `BFE`, and installed path `%windir%\system32\drivers\idmwfp.sys`. Live service inspection found it **Running**. The install also includes legacy TDI driver files.

The WFP driver's parsed imports include:

```text
FwpsCalloutRegister0          FwpmCalloutAdd0
FwpmFilterAdd0               FwpmSubLayerAdd0
FwpsCopyStreamDataToBuffer0   FwpsStreamInjectAsync0
FwpsFlowAssociateContext0    FwpsInjectTransportSendAsync0
FwpsInjectionHandleCreate0   FwpmEngineOpen0
```

These establish WFP callout, filtering, flow association, and injection capabilities. They do not by themselves prove the registered layer IDs, filtering conditions, target browser processes, or any particular user-mode function detour. The `IDMNetMon*`, `IDMVMPrs*`, legacy browser integration DLLs, and WFP/TDI components show a layered integration architecture; exact native hook locations were not recovered.

### KDM media implementation

KDM's MV3 extension observes response MIME types and keeps up to 50 media URLs per tab in session storage. Direct HTTP video/audio files can be sent to the desktop. HLS/DASH manifests are labeled and their URLs can be copied; adaptive-stream downloading and muxing are separate functionality not implemented by this build. Ordinary HTTPS transfers use .NET's TLS implementation and certificate validation. KDM needs no network driver or browser injection to download direct links.
