type RequestErrorLike = {
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

const NETWORK_FAILURE_MESSAGES = new Set([
  'failed to fetch',
  'network request failed',
]);

/**
 * Return only coarse, non-sensitive request diagnostics suitable for display.
 * Never surface an error message, URL, response body, or credential to users.
 */
export function safeRequestErrorCategory(error: unknown): string {
  if (error && typeof error === 'object') {
    const requestError = error as RequestErrorLike;
    const status = requestError.status;

    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
    ) {
      return `HTTP ${status}`;
    }

    if (requestError.name === 'NetworkError') {
      return 'Network error';
    }

    if (
      requestError.name === 'TypeError' &&
      typeof requestError.message === 'string' &&
      NETWORK_FAILURE_MESSAGES.has(requestError.message.trim().toLowerCase())
    ) {
      return 'Network error';
    }
  }

  return 'Details unavailable';
}