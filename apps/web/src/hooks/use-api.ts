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
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    { data?: T; title?: string; detail?: string; message?: string; code?: string } | T | null;
  if (!response.ok) {
    const problem =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const code = typeof problem.code === 'string' ? problem.code : undefined;
    if (
      response.status === 503 &&
      code === 'maintenance_mode' &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/maintenance'
    ) {
      window.location.assign('/maintenance');
    }
    throw new ApiError(userFacingError(problem, response.status, code), response.status, code);
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function userFacingError(
  problem: Record<string, unknown>,
  status: number,
  code?: string,
): string {
  const normalizedCode = code?.toLowerCase() || '';
  const technicalMessage = [problem.detail, problem.message, problem.title]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const originOrCsrfFailure =
    normalizedCode.includes('origin') ||
    normalizedCode.includes('csrf') ||
    technicalMessage.includes('invalid origin') ||
    technicalMessage.includes('origin not trusted') ||
    technicalMessage.includes('origin is not trusted') ||
    technicalMessage.includes('csrf');
  if (status >= 500 || originOrCsrfFailure) {
    return 'Something went wrong, but don’t fret — let’s give it another shot.';
  }
  return String(problem.detail || problem.message || problem.title || `Request failed (${status})`);
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
  const active = useRef(true);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    active.current = true;
    if (!path) {
      return;
    }
    const controller = new AbortController();
    // A path/version change represents a new external request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { signal: controller.signal })
      .then((value) => active.current && setData(value))
      .catch((reason: unknown) => {
        if (active.current && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : 'Something went wrong');
        }
      })
      .finally(() => active.current && setLoading(false));
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [path, version]);

  return { data, loading, error, reload };
}
