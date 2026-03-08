/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Gigara Hettige
 */

export type ProxyEnvelope =
  | { channel: 'ws-proxy.connect' }
  | { channel: 'ws-proxy.disconnect' }
  | { channel: 'ws-proxy.send'; payload: string }
  | { channel: 'ws-proxy.open' }
  | { channel: 'ws-proxy.close' }
  | { channel: 'ws-proxy.message'; payload: string }
  | { channel: 'ws-proxy.error'; message: string };

/** Connection lifecycle state emitted by adapters. */
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

/** Transport mode used by webview and extension bridge layers. */
export type TransportMode = 'proxy' | 'websocket';

/**
 * Bidirectional adapter contract used by webview clients.
 *
 * - `send` for fire-and-forget messages
 * - `request` for correlated request/response flows
 * - `subscribe` for push events and connection status updates
 */
export type SocketAdapter<TRequest, TResponse> = {
  send: (message: TRequest) => void;
  request: (message: TRequest) => Promise<TResponse>;
  close: () => void;
  subscribe: (
    listener: (message: TResponse) => void,
    onStatus: (status: ConnectionStatus) => void
  ) => () => void;
};
