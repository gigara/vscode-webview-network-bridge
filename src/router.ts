/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Gigara Hettige
 */

type ActionRequest = { action: string };

type RequestHandler<TRequest extends ActionRequest, TResponse, TAction extends TRequest['action']> = (
  request: Extract<TRequest, { action: TAction }>
) => TResponse;

type RouterOptions<TRequest extends ActionRequest, TResponse> = {
  /** Optional fallback invoked when no handler is registered for `request.action`. */
  onUnknownAction?: (request: TRequest) => TResponse;
};

/**
 * Creates a typed action router for request dispatch.
 *
 * This utility is useful for keeping extension-side request handling modular,
 * especially as action counts grow.
 */
export function createRequestRouter<TRequest extends ActionRequest, TResponse>(
  options: RouterOptions<TRequest, TResponse> = {}
) {
  const handlers = new Map<TRequest['action'], (request: TRequest) => TResponse>();

  return {
    register<TAction extends TRequest['action']>(
      action: TAction,
      handler: RequestHandler<TRequest, TResponse, TAction>
    ) {
      handlers.set(action, (request: TRequest) => handler(request as Extract<TRequest, { action: TAction }>));
    },
    handle(request: TRequest): TResponse {
      const handler = handlers.get(request.action);
      if (!handler) {
        if (options.onUnknownAction) {
          return options.onUnknownAction(request);
        }

        throw new Error(`No handler registered for action: ${request.action}`);
      }

      return handler(request);
    }
  };
}
