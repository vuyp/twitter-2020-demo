'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  status: number;
  code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    { data?: T; title?: string; detail?: string; message?: string; code?: string } | T | null;
  if (!response.ok) {
    const problem =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new ApiError(
      String(
        problem.detail || problem.message || problem.title || `Request failed (${response.status})`,
      ),
      response.status,
      typeof problem.code === 'string' ? problem.code : undefined,
    );
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useApi<T>(path: string | null, initial: T | null = null): AsyncState<T> {
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const initialValue = useRef(initial);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!path) {
      // A disabled request should not leave stale search results or a loading state behind.
      setData(initialValue.current);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    // A path/version change represents a new external request lifecycle.
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : 'Something went wrong');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, version]);

  return { data, loading, error, reload };
}
