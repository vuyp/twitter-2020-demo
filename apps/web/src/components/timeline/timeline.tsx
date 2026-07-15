'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/hooks/use-api';
import { normalizeTimelineEntry, type CursorPage, type Tweet } from '@/components/types';
import { EmptyState, ErrorState } from '@/components/shell/app-shell';
import { Spinner } from '@/components/ui/primitives';
import { TweetCard } from './tweet-card';

function normalizePage(payload: unknown): CursorPage<Tweet> {
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(payload)
      ? payload
      : [];
  return {
    items: rawItems.map(normalizeTimelineEntry),
    nextCursor: typeof source.nextCursor === 'string' ? source.nextCursor : null,
  };
}

export function Timeline({
  endpoint,
  refreshKey,
  emptyTitle = 'Welcome to Twitter!',
  emptyBody = 'This is the best place to see what’s happening in your world. Find some people and topics to follow now.',
  emptyAction,
  prepend,
}: {
  endpoint: string;
  refreshKey?: string | number;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  prepend?: Tweet | null;
}) {
  const [items, setItems] = useState<Tweet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (nextCursor?: string | null, replace = false) => {
      if (nextCursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const join = endpoint.includes('?') ? '&' : '?';
        const payload = await apiFetch<unknown>(
          `${endpoint}${nextCursor ? `${join}cursor=${encodeURIComponent(nextCursor)}` : ''}`,
        );
        const page = normalizePage(payload);
        setItems((current) =>
          replace
            ? page.items
            : [
                ...current,
                ...page.items.filter((tweet) => !current.some((item) => item.id === tweet.id)),
              ],
        );
        setCursor(page.nextCursor);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The timeline couldn’t load.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    // Reset state when the external endpoint identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    setCursor(null);
    void load(null, true);
  }, [load, refreshKey]);
  useEffect(() => {
    if (!prepend?.id) return;
    // Optimistic Tweets arrive through the parent composer after render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((current) => [prepend, ...current.filter((item) => item.id !== prepend.id)]);
  }, [prepend]);
  useEffect(() => {
    if (!cursor || !sentinel.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) void load(cursor);
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [cursor, load, loadingMore]);

  if (loading && items.length === 0) return <TimelineSkeleton />;
  if (error && items.length === 0)
    return <ErrorState message={error} retry={() => void load(null, true)} />;
  if (items.length === 0)
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;

  return (
    <section className="timeline" aria-label="Timeline" aria-busy={loadingMore}>
      {items.map((tweet) => (
        <TweetCard
          key={tweet.id}
          initialTweet={tweet}
          onDelete={(id) => setItems((current) => current.filter((item) => item.id !== id))}
        />
      ))}
      <div ref={sentinel} className="timeline-sentinel">
        {loadingMore && <Spinner label="Loading more Tweets" />}
        {error && (
          <div className="timeline-load-error" role="status">
            <span>More Tweets couldn’t load.</span>
            <button onClick={() => void load(cursor)}>Try again</button>
          </div>
        )}
      </div>
    </section>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="timeline-loading" role="status" aria-label="Loading Tweets" aria-live="polite">
      <span className="sr-only">Loading Tweets</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="tweet-loading" key={index}>
          <span className="loading-avatar" />
          <div>
            <span className="loading-line short" />
            <span className="loading-line" />
            <span className="loading-line medium" />
            <div className="loading-actions">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
