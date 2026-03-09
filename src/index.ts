/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Gigara Hettige
 */

export type { ConnectionStatus, ProxyEnvelope, SocketAdapter, TransportMode } from './types';
export { createRequestRouter } from './router';
export {
	createWebviewTransportAdapter,
	injectVSCodeCssVariables,
	DEFAULT_VSCODE_CSS_VARIABLES,
	VSCODE_DARK_PLUS_CSS_VARIABLES,
	VSCODE_LIGHT_PLUS_CSS_VARIABLES
} from './webview';
export { createExtensionTransportManager } from './extension';
