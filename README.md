# vscode-webview-network-bridge

Transport bridge for VS Code extension ↔ webview communication over `postMessage`, with optional WebSocket transport and correlated request/response semantics.

The package abstracts low-level VS Code message plumbing (`postMessage` handlers and listener lifecycle) behind a consistent API.
It also enables the same web application codebase to run in a standard browser while VS Code operates as a headless bridge host.

## Features

- Webview adapter with `send`, `request`, and `subscribe` APIs
- Extension-side transport manager for webview registration, routing, and extension-originated publish
- Encapsulated `postMessage` and listener lifecycle management
- Proxy transport mode (extension-hosted bridge over `postMessage`)
- WebSocket transport mode (direct browser/socket connectivity)
- Correlated request/response envelopes (`rpc.request` / `rpc.response`)
- Reusable request router utility for backend action dispatch
- Browser-hosted UI support with VS Code as a headless bridge host

## Installation

```bash
npm install vscode-webview-network-bridge
```

## Sample Application

For a complete end-to-end implementation (VS Code extension host + webview UI + browser mode), see:

- https://github.com/gigara/vscode-ws-todo

## API

### Core Types

- `SocketAdapter<TRequest, TResponse>`
- `TransportMode` (`proxy` | `websocket`)
- `ConnectionStatus`
- `ProxyEnvelope`

### Webview Entry

Import from `vscode-webview-network-bridge/webview`.

- `createWebviewTransportAdapter<TRequest, TResponse>(options)`

`createWebviewTransportAdapter` options:

- `mode`: `proxy` or `websocket`
- `server`, `port`, `protocol` (for websocket mode)
- `serialize`, `deserialize`
- `mapProxyError`

#### `createWebviewTransportAdapter(options)` arguments

| Argument | Type | Required | Default | Description |
|---|---|---:|---|---|
| `options.mode` | `'proxy' \| 'websocket'` | No | `'proxy'` | Selects transport mode. `proxy` uses VS Code `postMessage`; `websocket` uses native WebSocket. |
| `options.server` | `string` | No | `'127.0.0.1'` | WebSocket host used in `websocket` mode. |
| `options.port` | `number` | No | `8787` | WebSocket port used in `websocket` mode. |
| `options.protocol` | `'ws' \| 'wss'` | No | `'ws'` | Protocol used to build the socket URL in `websocket` mode. |
| `options.acquireVsCodeApi` | `() => { postMessage(...) } \| undefined` | No | global `acquireVsCodeApi` | Custom VS Code API accessor for testability or advanced host integration. |
| `options.serialize` | `(request: TRequest) => string` | No | `JSON.stringify` | Request payload serializer before transport send. |
| `options.deserialize` | `(payload: string) => TResponse` | No | `JSON.parse` cast | Response payload parser for inbound messages. |
| `options.mapProxyError` | `(message: string) => TResponse` | No | — | Maps proxy transport errors to a typed response shape. |
| `options.WebSocketImpl` | `typeof WebSocket` | No | global `WebSocket` | Custom WebSocket constructor (useful for tests). |

`createWebviewTransportAdapter` additionally provides runtime mode controls:

- `getMode(): TransportMode`
- `switchMode(mode: TransportMode): void`

Browser runtime theming helper:

- `injectVSCodeCssVariables(overrides?, target?, theme?)`
- `VSCodeCssTheme` (`'dark' | 'light'`)
- `DEFAULT_VSCODE_CSS_VARIABLES`
- `VSCODE_DARK_PLUS_CSS_VARIABLES` (values from VS Code default Dark+ theme)
- `VSCODE_LIGHT_PLUS_CSS_VARIABLES` (values from VS Code default Light+ theme)

`injectVSCodeCssVariables` defaults to `theme = 'dark'` and uses `VSCODE_DARK_PLUS_CSS_VARIABLES` or
`VSCODE_LIGHT_PLUS_CSS_VARIABLES` as base values before applying `overrides`.

Theme value maps are generated from VS Code open-source default theme files:

- Source file: `src/vscodeCssVariables.ts`
- Refresh command: `npm run update:vscode-css-vars`
- Sources: `dark_vs` + `dark_plus`, `light_vs` + `light_plus`

Use this when running in a plain browser (`websocket` mode), where VS Code does not inject `--vscode-*` variables automatically.

```ts
import {
  createWebviewTransportAdapter,
  injectVSCodeCssVariables
} from 'vscode-webview-network-bridge/webview';

if ((window.__WS_MODE__ ?? 'proxy') === 'websocket') {
  injectVSCodeCssVariables({
    '--vscode-editor-background': '#1e1e1e'
  }, document.documentElement, 'dark');

  // Or use built-in Light+ defaults:
  // injectVSCodeCssVariables({}, document.documentElement, 'light');
}
```

### Extension Entry

Import from `vscode-webview-network-bridge/extension`.

- `createExtensionTransportManager<TRequest, TResponse>(options)`

`createExtensionTransportManager` returns methods including:

- `registerWebviewPanel(panel)`
- `publish(response)`
- `startWebSocketServer()`, `stopWebSocketServer()`
- `switchMode(mode)`, `getMode()`
- `getWebviewBootstrap()`
- `dispose()`

#### `createExtensionTransportManager(options)` arguments

| Argument | Type | Required | Default | Description |
|---|---|---:|---|---|
| `options.initialMode` | `'proxy' \| 'websocket'` | No | `'proxy'` | Initial transport mode for manager state. |
| `options.wsPort` | `number` | No | `8787` | Port used when manager starts its WebSocket server. |
| `options.wsUrlBase` | `string` | No | `'ws://127.0.0.1'` | Base URL used for bootstrap metadata (`wsServer`, `wsPort`). |
| `options.handleRequest` | `(request: TRequest) => TResponse \| void \| Promise<TResponse \| void>` | Yes | — | Core request handler invoked for inbound proxy/WebSocket requests. Supports sync/async handlers and notification-style `void` responses. |
| `options.deserialize` | `(payload: string) => TRequest` | No | `JSON.parse` cast | Inbound payload parser. |
| `options.serialize` | `(response: TResponse) => string` | No | `JSON.stringify` | Outbound payload serializer. |
| `options.initialResponse` | `() => TResponse \| undefined` | No | — | Optional initial state message sent to new clients. |

#### `createExtensionTransportManager` returned methods

| Method | Description |
|---|---|
| `registerWebviewPanel(panel)` | Registers panel message channels (`postMessage`, receive handler, and dispose cleanup). |
| `publish(response)` | Pushes extension-originated messages to all connected webviews and WebSocket clients. |
| `startWebSocketServer()` | Starts the WebSocket server and returns the bound port. |
| `stopWebSocketServer()` | Stops the WebSocket server if running. |
| `isWebSocketServerRunning()` | Returns whether the WebSocket server is running. |
| `switchMode(mode)` | Switches between `proxy` and `websocket`. |
| `getMode()` | Returns current manager mode. |
| `getWebviewBootstrap()` | Returns bootstrap metadata: `{ mode, wsServer, wsPort }`. |
| `dispose()` | Disposes manager resources and active server. |

### Router Entry

Import from `vscode-webview-network-bridge/router`.

- `createRequestRouter<TRequest, TResponse>(options)`

Router methods:

- `register(action, handler)`
- `handle(request)`

#### `createRequestRouter(options)` arguments

| Argument | Type | Required | Default | Description |
|---|---|---:|---|---|
| `options.onUnknownAction` | `(request: TRequest) => TResponse \| void \| Promise<TResponse \| void>` | No | throws error | Fallback when no handler exists for `request.action`. |

#### `register(action, handler)` arguments

| Argument | Type | Required | Description |
|---|---|---:|---|
| `action` | `TRequest['action']` | Yes | Action key used for dispatch lookup. |
| `handler` | `(request: Extract<TRequest, { action: TAction }>) => TResponse \| void \| Promise<TResponse \| void>` | Yes | Action-specific typed handler. |

## Usage Examples

### Request/Response Data Type Example

```ts
// Requests sent from webview to extension/backend.
type Request =
  | { action: 'ping' }
  | { action: 'todos.list' }
  | { action: 'todos.add'; title: string };

// Responses sent from extension/backend to webview.
type Response =
  | { type: 'pong'; at: string }
  | { type: 'todos'; items: Array<{ id: string; title: string; done: boolean }> }
  | { type: 'ack'; message: string }
  | { type: 'error'; message: string };
```

### Webview Side

```ts
import { createWebviewTransportAdapter } from 'vscode-webview-network-bridge/webview';

type Request = { action: 'ping' };
type Response = { type: 'pong'; at: string } | { type: 'error'; message: string };

// Create a transport adapter for VS Code proxy mode (default mode is also `proxy`).
const adapter = createWebviewTransportAdapter<Request, Response>({
  mode: 'proxy',
  mapProxyError: (message) => ({ type: 'error', message })
});

// Subscribe to pushed messages and connection status updates.
adapter.subscribe((message) => {
  if (message.type === 'pong') {
    console.log(message.at);
  }
}, () => {});

// Fire-and-forget message.
adapter.send({ action: 'ping' });

// Request/response (correlated RPC-style call).
const response = await adapter.request({ action: 'ping' });

```

### Extension Side

```ts
import { createExtensionTransportManager } from 'vscode-webview-network-bridge/extension';

// Manager owns proxy/websocket handling and request routing.
const transport = createExtensionTransportManager<Request, Response>({
  handleRequest: async (request) => handlerAsync(request),
  initialResponse: () => ({ type: 'pong', at: new Date().toISOString() })
});

// Attach a VS Code webview panel to transport channels.
transport.registerWebviewPanel(panel);

// Push extension-originated updates to connected clients.
transport.publish({ type: 'pong', at: new Date().toISOString() });
```

### Router Side

```ts
import { createRequestRouter } from 'vscode-webview-network-bridge/router';

// Create an action router for request handling.
const router = createRequestRouter<Request, Response>({
  onUnknownAction: () => ({ type: 'error', message: 'Unknown action' })
});

// Register action-specific handlers.
router.register('ping', () => ({ type: 'pong', at: new Date().toISOString() }));

// Dispatch a request through the router.
const response = router.handle({ action: 'ping' });
```

## Migration Guide

This section helps existing integrations move from manual messaging or `vscode-webview-messenger` to `vscode-webview-network-bridge`.

### Migrate from raw `postMessage`

#### 1) Define explicit request/response contracts

```ts
type Request =
  | { action: 'todos.list' }
  | { action: 'todos.add'; text: string };

type Response =
  | { type: 'todos.state'; todos: Array<{ id: string; text: string; done: boolean }> }
  | { type: 'error'; message: string };
```

#### 2) Replace manual webview messaging

Before (manual):

```ts
const vscode = acquireVsCodeApi();

vscode.postMessage({ action: 'todos.list' });
window.addEventListener('message', (event) => {
  const message = event.data;
  // manual channel/type checks
});
```

After (adapter):

```ts
import { createWebviewTransportAdapter } from 'vscode-webview-network-bridge/webview';

const adapter = createWebviewTransportAdapter<Request, Response>({ mode: 'proxy' });

adapter.subscribe((message) => {
  // typed response handling
}, () => {});

adapter.send({ action: 'todos.list' });
const response = await adapter.request({ action: 'todos.list' });
```

#### 3) Replace extension-side message plumbing

Before (manual):

```ts
panel.webview.onDidReceiveMessage((message) => {
  // manual action routing
  panel.webview.postMessage(response);
});
```

After (manager + router):

```ts
import { createExtensionTransportManager } from 'vscode-webview-network-bridge/extension';
import { createRequestRouter } from 'vscode-webview-network-bridge/router';

const router = createRequestRouter<Request, Response>();
router.register('todos.list', () => ({ type: 'todos.state', todos: [] }));

const transport = createExtensionTransportManager<Request, Response>({
  handleRequest: (request) => router.handle(request)
});

transport.registerWebviewPanel(panel);
```

### Migrate from `vscode-webview-messenger`

Use this mapping to move concepts with minimal changes:

| Existing concept (`vscode-webview-messenger`) | `vscode-webview-network-bridge` equivalent |
|---|---|
| Message command/event name | `request.action` and `response.type` |
| `postMessage` from webview | `adapter.send(request)` |
| Request expecting reply | `await adapter.request(request)` |
| Extension message handler registration | `handleRequest` in `createExtensionTransportManager(...)` |
| Message routing map | `createRequestRouter(...).register(action, handler)` |
| Push from extension to webview | `transport.publish(response)` |

#### Suggested migration order

1. Introduce shared `Request` and `Response` union types.
2. Wrap webview communication with `createWebviewTransportAdapter(...)`.
3. Move extension handling to `createExtensionTransportManager(...)`.
4. Move per-action logic into `createRequestRouter(...)`.
5. Replace ad-hoc push events with `transport.publish(...)`.

#### Compatibility note

You can migrate incrementally by keeping existing action names and payload shapes, then gradually tightening types.

## Runtime Requirements

- Node.js 18+
- VS Code extension host (for proxy mode extension side)

## License

MIT
