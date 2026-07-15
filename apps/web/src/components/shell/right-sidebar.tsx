'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { Avatar, VerifiedBadge } from '@/components/ui/primitives';

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
  const { data: trendPayload, loading } = useApi<unknown[]>('/api/v1/trends', []);
  const { data: suggestionPayload } = useApi<unknown>('/api/v1/suggestions');
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
      {!pathname.startsWith('/search') && (
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
      <section className="sidebar-card" aria-labelledby="trends-title">
        <div className="sidebar-card-title">
          <h2 id="trends-title">What’s happening</h2>
          <Link href="/settings/trends" aria-label="Trend settings">
            <Icon name="settings" size={21} />
          </Link>
        </div>
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div className="trend-row trend-row-loading" key={i}>
              <span />
              <strong />
              <span />
            </div>
          ))}
        {!loading && trends.length === 0 && (
          <div className="sidebar-card-empty">Trends appear here as people start Tweeting.</div>
        )}
        {trends.slice(0, 6).map((trend, index) => {
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
      <section className="sidebar-card" aria-labelledby="follow-title">
        <div className="sidebar-card-title">
          <h2 id="follow-title">Who to follow</h2>
        </div>
        {suggestions.length === 0 && (
          <div className="sidebar-card-empty">
            Suggestions will appear as Twitter learns who you’re interested in.
          </div>
        )}
        {suggestions.slice(0, 3).map((user) => (
          <SuggestionCard user={user} key={user.id || user.handle} />
        ))}
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

function SuggestionCard({ user }: { user: User }) {
  const [following, setFollowing] = useState(Boolean(user.following));
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
        onClick={async () => {
          const before = following;
          setFollowing(!before);
          try {
            await apiFetch(`/api/v1/users/${user.handle}/follow`, {
              method: before ? 'DELETE' : 'POST',
              ...(before ? {} : { body: JSON.stringify({}) }),
            });
          } catch {
            setFollowing(before);
          }
        }}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}
