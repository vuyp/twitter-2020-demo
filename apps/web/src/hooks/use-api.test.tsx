import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApi } from './use-api';

type PendingResponse = {
  path: string;
  resolve: (response: Response) => void;
};

describe('useApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores a stale response after the request path changes', async () => {
    const pending: PendingResponse[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (path: string | URL | Request) =>
          new Promise<Response>((resolve) => pending.push({ path: String(path), resolve })),
      ),
    );

    const { result, rerender } = renderHook(({ path }) => useApi<{ value: string }>(path), {
      initialProps: { path: '/first' as string | null },
    });

    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ path: '/second' });
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1]?.resolve(Response.json({ value: 'new' }));
    });
    await waitFor(() => expect(result.current.data).toEqual({ value: 'new' }));

    await act(async () => {
      pending[0]?.resolve(Response.json({ value: 'stale' }));
    });
    expect(result.current.data).toEqual({ value: 'new' });
  });

  it('clears stale data and loading state when its path is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ value: 'result' })),
    );
    const { result, rerender } = renderHook(({ path }) => useApi<{ value: string }>(path), {
      initialProps: { path: '/search' as string | null },
    });

    await waitFor(() => expect(result.current.data).toEqual({ value: 'result' }));
    rerender({ path: null });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
