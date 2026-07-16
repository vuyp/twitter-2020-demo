'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { Avatar, Skeleton, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { useSession, useToast } from '@/components/providers/app-providers';

type Trend = {
  name?: string;
  topic?: string;
  category?: string;
  tweetCount?: number;
  count?: number;
};

export function RightSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const {
    data: trendPayload,
    loading: trendsLoading,
    error: trendsError,
    reload: reloadTrends,
  } = useApi<unknown[]>(pathname === '/explore' ? null : '/api/v1/trends', []);
  const {
    data: suggestionPayload,
    loading: suggestionsLoading,
    error: suggestionsError,
    reload: reloadSuggestions,
  } = useApi<unknown>('/api/v1/suggestions');
  const trends = Array.isArray(trendPayload) ? (trendPayload as Trend[]) : [];
  const suggestionSource =
    suggestionPayload && typeof suggestionPayload === 'object' && !Array.isArray(suggestionPayload)
      ? (suggestionPayload as Record<string, unknown>)
      : {};
  const suggestions = (
    Array.isArray(suggestionPayload)
      ? suggestionPayload
      : Array.isArray(suggestionSource.items)
        ? suggestionSource.items
        : []
  ).map(normalizeUser);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <aside className="right-rail" aria-label="Sidebar">
      {!pathname.startsWith('/search') && pathname !== '/explore' && (
        <form className="global-search" role="search" onSubmit={submit}>
          <Icon name="search" size={20} />
          <label className="sr-only" htmlFor="global-search">
            Search Twitter
          </label>
          <input
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Twitter"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={16} />
            </button>
          )}
        </form>
      )}
      {pathname !== '/explore' && (
        <section className="sidebar-card" aria-labelledby="trends-title">
          <div className="sidebar-card-title">
            <h2 id="trends-title">What’s happening</h2>
            <Link href="/settings/trends" aria-label="Trend settings">
              <Icon name="settings" size={21} />
            </Link>
          </div>
          {trendsLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div className="trend-row trend-row-loading" key={i}>
                <span />
                <strong />
                <span />
              </div>
            ))}
          {!trendsLoading && trendsError && (
            <SidebarError message="Trends aren’t available right now." retry={reloadTrends} />
          )}
          {!trendsLoading && !trendsError && trends.length === 0 && (
            <div className="sidebar-card-empty">Trends appear here as people start Tweeting.</div>
          )}
          {!trendsError &&
            trends.slice(0, 6).map((trend, index) => {
              const name = trend.name || trend.topic || '';
              const count = trend.tweetCount || trend.count;
              return (
                <Link
                  key={`${name}-${index}`}
                  href={`/search?q=${encodeURIComponent(name)}`}
                  className="trend-row"
                >
                  <span>{trend.category || 'Trending'}</span>
                  <strong>{name}</strong>
                  {count ? <span>{count.toLocaleString()} Tweets</span> : <span>Trending now</span>}
                </Link>
              );
            })}
          <Link className="sidebar-show-more" href="/explore">
            Show more
          </Link>
        </section>
      )}
      <section className="sidebar-card" aria-labelledby="follow-title">
        <div className="sidebar-card-title">
          <h2 id="follow-title">Who to follow</h2>
        </div>
        {suggestionsLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <div className="suggestion-card suggestion-card-loading" key={index}>
              <Skeleton width={40} height={40} round />
              <span className="suggestion-loading-copy">
                <Skeleton width="72%" height={13} />
                <Skeleton width="52%" height={11} />
              </span>
              <Skeleton width={68} height={30} round />
            </div>
          ))}
        {!suggestionsLoading && suggestionsError && (
          <SidebarError
            message="Suggestions aren’t available right now."
            retry={reloadSuggestions}
          />
        )}
        {!suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
          <div className="sidebar-card-empty">
            Suggestions will appear as Twitter learns who you’re interested in.
          </div>
        )}
        {!suggestionsError &&
          suggestions
            .slice(0, 3)
            .map((user) => <SuggestionCard user={user} key={user.id || user.handle} />)}
        <Link className="sidebar-show-more" href="/connect_people">
          Show more
        </Link>
      </section>
      <nav className="footer-links" aria-label="Footer">
        <a href="https://twitter.com/tos" target="_blank" rel="noreferrer">
          Terms
        </a>
        <a href="https://twitter.com/privacy" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        <a
          href="https://help.twitter.com/rules-and-policies/twitter-cookies"
          target="_blank"
          rel="noreferrer"
        >
          Cookie Policy
        </a>
        <a href="https://help.twitter.com/resources/accessibility" target="_blank" rel="noreferrer">
          Accessibility
        </a>
        <span>Unofficial UI demo · Not affiliated with Twitter/X</span>
      </nav>
    </aside>
  );
}

function SidebarError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="sidebar-card-error">
      <span>{message}</span>
      <button onClick={retry}>Try again</button>
    </div>
  );
}

function SuggestionCard({ user }: { user: User }) {
  const [following, setFollowing] = useState(Boolean(user.following));
  const [followRequested, setFollowRequested] = useState(Boolean(user.followRequested));
  const [pending, setPending] = useState(false);
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  return (
    <div className="suggestion-card">
      <Link href={`/${user.handle}`}>
        <Avatar user={user} size={40} />
      </Link>
      <Link href={`/${user.handle}`} className="suggestion-copy">
        <strong>
          {user.name}
          {user.verified && <VerifiedBadge />}
        </strong>
        <small>@{user.handle}</small>
      </Link>
      <button
        className={`button ${following ? 'following' : ''}`}
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          if (!viewer) {
            router.push('/login');
            return;
          }
          const wasFollowing = following;
          const wasRequested = followRequested;
          const active = wasFollowing || wasRequested;
          setFollowing(active ? false : !user.protected);
          setFollowRequested(active ? false : Boolean(user.protected));
          setPending(true);
          try {
            const result = await apiFetch<{
              state?: 'following' | 'requested' | 'not-following';
            }>(`/api/v1/users/${encodeURIComponent(user.handle)}/follow`, {
              method: active ? 'DELETE' : 'POST',
              ...(active ? {} : { body: JSON.stringify({}) }),
            });
            setFollowing(result.state === 'following');
            setFollowRequested(result.state === 'requested');
          } catch (reason) {
            setFollowing(wasFollowing);
            setFollowRequested(wasRequested);
            showToast(
              reason instanceof Error ? reason.message : 'That follow request didn’t work.',
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? (
          <Spinner label="Updating follow" />
        ) : followRequested ? (
          'Pending'
        ) : following ? (
          'Following'
        ) : (
          'Follow'
        )}
      </button>
    </div>
  );
}
