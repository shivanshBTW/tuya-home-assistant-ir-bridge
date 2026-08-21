export const API_TOKEN_STORAGE_KEY = 'tuyaBridgeApiToken';

export const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL ?? '';
};

export const getApiToken = (): string => {
  return window.localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? '';
};

export const setApiToken = (token: string): void => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
};

export class BridgeApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BridgeApiError';
    this.statusCode = statusCode;
  }
}

export const requestBridge = async <T>({
  path,
  method = 'GET',
  body,
}: {
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
}): Promise<T> => {
  const headers: Record<string, string> = {
    'X-API-Token': getApiToken(),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errorBody = (await response.json()) as { error?: string; message?: string };
      message = errorBody.error ?? errorBody.message ?? message;
    } catch {
      // Keep the status message when the body is not JSON.
    }
    throw new BridgeApiError(message, response.status);
  }

  return (await response.json()) as T;
};
