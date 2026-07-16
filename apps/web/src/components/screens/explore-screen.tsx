'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell, EmptyState, ErrorState, Tabs } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { Avatar, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { apiFetch, useApi } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { Timeline } from '@/components/timeline/timeline';
import { useSession, useToast } from '@/components/providers/app-providers';
import '@/styles/explore.css';

type Trend = {
  name?: string;
  topic?: string;
  category?: string;
  description?: string;
  tweetCount?: number;
  count?: number;
};

export function ExploreScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('for-you');
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/trends');
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const trends = (
    Array.isArray(data) ? data : Array.isArray(source.items) ? source.items : []
  ) as Trend[];
  const visibleTrends =
    tab === 'for-you' || tab === 'trending'
      ? trends
      : trends.filter((trend) => trend.category?.toLowerCase().includes(tab));
  const tabs = ['For you', 'Trending', 'News', 'Sports', 'Entertainment'];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <AppShell hideRightSidebar publicAccess>
      <div className="explore-header">
        <form className="explore-search" role="search" onSubmit={submit}>
          <Icon name="search" size={20} />
          <label className="sr-only" htmlFor="global-search">
            Search Twitter
          </label>
          <input
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Twitter"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={16} />
            </button>
          )}
        </form>
        <Link className="icon-button" href="/settings/trends" aria-label="Explore settings">
          <Icon name="settings" size={22} />
        </Link>
      </div>
      <nav className="explore-tabs" aria-label="Explore categories">
        {tabs.map((label) => {
          const key = label.toLowerCase().replace(' ', '-');
          return (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          );
        })}
      </nav>
      <section
        className="explore-content"
        aria-label={`${tabs.find((value) => value.toLowerCase().replace(' ', '-') === tab)} trends`}
      >
        <div className="explore-section-heading">
          <h1>
            {tab === 'for-you'
              ? 'Trends for you'
              : tabs.find((label) => label.toLowerCase() === tab) || 'Trending'}
          </h1>
          <Link href="/settings/trends">
            <Icon name="settings" size={21} />
          </Link>
        </div>
        {loading && (
          <div className="explore-loading">
            <Spinner />
          </div>
        )}
        {error && <ErrorState message={error} retry={reload} />}
        {!loading && !error && visibleTrends.length === 0 && (
          <EmptyState
            icon="explore"
            title="No trends yet"
            body="When conversations start gaining momentum, you’ll find them here."
          />
        )}
        {visibleTrends.map((trend, index) => {
          const name = trend.name || trend.topic || '';
          const count = trend.tweetCount || trend.count;
          return (
            <Link
              href={`/search?q=${encodeURIComponent(name)}`}
              className="explore-trend"
              key={`${name}-${index}`}
            >
              <span>{trend.category || `${index + 1} · Trending`}</span>
              <strong>{name}</strong>
              {trend.description && <p>{trend.description}</p>}
              {count ? (
                <span>
                  {count.toLocaleString()} {count === 1 ? 'Tweet' : 'Tweets'}
                </span>
              ) : (
                <span>Trending now</span>
              )}
              <Icon name="more" size={20} />
            </Link>
          );
        })}
      </section>
    </AppShell>
  );
}

const searchTabs = ['Top', 'Latest', 'People', 'Photos', 'Videos'];

export function SearchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.get('q') || '';
  const typeParam = params.get('f') || 'top';
  const [draft, setDraft] = useState(query);
  useEffect(() => {
    // Browser history can change the URL without remounting this search field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(query);
  }, [query]);
  const apiType = typeParam === 'photos' || typeParam === 'videos' ? 'media' : typeParam;
  const mediaFilter =
    typeParam === 'photos' ? '&media=photo' : typeParam === 'videos' ? '&media=video' : '';
  const endpoint = query
    ? `/api/v1/search?q=${encodeURIComponent(query)}&type=${apiType}${mediaFilter}`
    : null;
  const { data, loading, error, reload } = useApi<unknown>(
    typeParam === 'people' ? endpoint : null,
  );
  const users = useMemo(() => {
    const source =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const items = Array.isArray(data) ? data : Array.isArray(source.items) ? source.items : [];
    return items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return normalizeUser(entry.user || item);
    });
  }, [data]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.trim())
      router.push(
        `/search?q=${encodeURIComponent(draft.trim())}${typeParam === 'top' ? '' : `&f=${typeParam}`}`,
      );
  };
  const tabItems = searchTabs.map((label) => ({
    label,
    href: `/search?q=${encodeURIComponent(query)}&f=${label.toLowerCase()}`,
    active: typeParam === label.toLowerCase(),
  }));

  return (
    <AppShell publicAccess>
      <div className="search-page-header">
        <button className="icon-button" onClick={() => router.back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <form className="explore-search" onSubmit={submit} role="search">
          <Icon name="search" size={20} />
          <input
            id="global-search"
            aria-label="Search query"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {draft && (
            <button type="button" onClick={() => setDraft('')} aria-label="Clear">
              <Icon name="close" size={16} />
            </button>
          )}
        </form>
        <Link className="icon-button" href="/settings/search_settings" aria-label="Search settings">
          <Icon name="more" size={20} />
        </Link>
      </div>
      <Tabs items={tabItems} />
      {!query && (
        <EmptyState
          icon="search"
          title="Search Twitter"
          body="Search for people, topics, or keywords to discover what’s happening."
        />
      )}
      {query && typeParam !== 'people' && (
        <Timeline
          endpoint={endpoint || ''}
          refreshKey={`${pathname}-${query}-${typeParam}`}
          emptyTitle="No results for this search"
          emptyBody="Try searching for something else, or check your search settings."
        />
      )}
      {query && typeParam === 'people' && (
        <PeopleResults
          users={users}
          loading={loading}
          error={error}
          reload={reload}
          query={query}
        />
      )}
    </AppShell>
  );
}

function PeopleResults({
  users,
  loading,
  error,
  reload,
  query,
}: {
  users: User[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  query: string;
}) {
  if (loading)
    return (
      <div className="explore-loading">
        <Spinner />
      </div>
    );
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!users.length)
    return (
      <EmptyState
        icon="people"
        title={`No people found for “${query}”`}
        body="Try searching for a name or username."
      />
    );
  return (
    <section aria-label="People">
      {users.map((user) => (
        <PersonResult user={user} key={user.id || user.handle} />
      ))}
    </section>
  );
}

function PersonResult({ user }: { user: User }) {
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const [following, setFollowing] = useState(Boolean(user.following));
  const [followRequested, setFollowRequested] = useState(Boolean(user.followRequested));
  const [pending, setPending] = useState(false);
  const changeFollow = async () => {
    if (!viewer) {
      router.push('/login');
      return;
    }
    if (pending || viewer.id === user.id) return;
    const wasFollowing = following;
    const wasRequested = followRequested;
    const active = wasFollowing || wasRequested;
    setFollowing(active ? false : !user.protected);
    setFollowRequested(active ? false : Boolean(user.protected));
    setPending(true);
    try {
      const result = await apiFetch<{ state?: 'following' | 'requested' | 'not-following' }>(
        `/api/v1/users/${encodeURIComponent(user.handle)}/follow`,
        {
          method: active ? 'DELETE' : 'POST',
          ...(active ? {} : { body: JSON.stringify({}) }),
        },
      );
      setFollowing(result.state === 'following');
      setFollowRequested(result.state === 'requested');
    } catch (reason) {
      setFollowing(wasFollowing);
      setFollowRequested(wasRequested);
      showToast(reason instanceof Error ? reason.message : 'That follow request did not work.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="person-result">
      <Link href={`/${user.handle}`}>
        <Avatar user={user} size={48} />
      </Link>
      <Link href={`/${user.handle}`} className="person-result-copy">
        <strong>
          {user.name}
          {user.verified && <VerifiedBadge />}
        </strong>
        <small>@{user.handle}</small>
        {user.bio && <p>{user.bio}</p>}
      </Link>
      {viewer?.id !== user.id && (
        <button
          className={`button ${following || followRequested ? 'following' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            void changeFollow();
          }}
          disabled={pending}
          aria-busy={pending}
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
      )}
    </div>
  );
}
