'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell, EmptyState, ErrorState, PageHeader, Tabs } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { Avatar, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { useApi, apiFetch } from '@/hooks/use-api';
import { normalizeTweet, normalizeUser, type Tweet, type User } from '@/components/types';
import { TweetCard } from '@/components/timeline/tweet-card';
import { useToast } from '@/components/providers/app-providers';
import '@/styles/notifications.css';

type NotificationItem = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  actors: User[];
  tweet?: Tweet | null;
};

function normalizeNotification(value: unknown): NotificationItem {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawActors = Array.isArray(source.actors)
    ? source.actors
    : source.actor
      ? [source.actor]
      : [];
  return {
    id: String(source.id || ''),
    type: String(source.type || 'notification'),
    read: Boolean(source.read || source.readAt),
    createdAt: String(source.createdAt || ''),
    actors: rawActors.map(normalizeUser),
    tweet: source.tweet ? normalizeTweet(source.tweet) : null,
  };
}

export function NotificationsScreen({ mentions = false }: { mentions?: boolean }) {
  const path = `/api/v1/notifications?filter=${mentions ? 'mentions' : 'all'}`;
  const { data, loading, error, reload } = useApi<unknown>(path);
  const { showToast } = useToast();
  const items = useMemo(() => {
    const source =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const list = Array.isArray(data) ? data : Array.isArray(source.items) ? source.items : [];
    return list.map(normalizeNotification);
  }, [data]);
  useEffect(() => {
    const update = () => reload();
    window.addEventListener('twitter:notification-new', update);
    return () => window.removeEventListener('twitter:notification-new', update);
  }, [reload]);

  const markRead = async () => {
    try {
      await apiFetch('/api/v1/notifications', { method: 'PATCH', body: JSON.stringify({}) });
      reload();
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : 'Notifications couldn’t be marked as read.',
      );
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        action={
          <div className="notification-actions">
            <button
              className="icon-button"
              onClick={() => void markRead()}
              aria-label="Mark all as read"
            >
              <Icon name="check" size={21} />
            </button>
            <Link
              className="icon-button"
              href="/settings/notifications"
              aria-label="Notification settings"
            >
              <Icon name="settings" size={21} />
            </Link>
          </div>
        }
      />
      <Tabs
        items={[
          { label: 'All', href: '/notifications', active: !mentions },
          { label: 'Mentions', href: '/notifications/mentions', active: mentions },
        ]}
      />
      {loading && (
        <div className="notifications-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="bell"
          title={mentions ? 'Nothing to see here — yet' : 'You don’t have any notifications yet'}
          body={
            mentions
              ? 'When someone mentions you, you’ll find it here.'
              : 'From likes to Retweets and a whole lot more, this is where all the action happens.'
          }
        />
      )}
      {items.length > 0 && (
        <section aria-label="Notifications">
          {items.map((item) => (
            <NotificationRow item={item} key={item.id} />
          ))}
        </section>
      )}
    </AppShell>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const [requestHandled, setRequestHandled] = useState<'accepted' | 'declined' | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const { showToast } = useToast();
  if ((item.type === 'mention' || item.type === 'reply') && item.tweet)
    return <TweetCard initialTweet={item.tweet} />;
  const first = item.actors[0];
  const copy = notificationCopy(item.type);
  const color = item.type.includes('like')
    ? 'like'
    : item.type.includes('follow')
      ? 'follow'
      : 'retweet';
  const respondToRequest = async (action: 'accept' | 'decline') => {
    if (!first || requestPending) return;
    setRequestPending(true);
    try {
      await apiFetch(`/api/v1/follow-requests/${first.id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setRequestHandled(action === 'accept' ? 'accepted' : 'declined');
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : 'That follow request could not be updated.',
      );
    } finally {
      setRequestPending(false);
    }
  };
  return (
    <article className={`notification-row notification-${color} ${item.read ? '' : 'unread'}`}>
      <div className="notification-icon">
        <Icon
          name={color === 'like' ? 'heart' : color === 'follow' ? 'user' : 'retweet'}
          size={29}
          fill={color === 'like' ? 'currentColor' : 'none'}
        />
      </div>
      <div className="notification-body">
        <div className="notification-avatars">
          {item.actors.slice(0, 6).map((actor) => (
            <Link href={`/${actor.handle}`} key={actor.id || actor.handle}>
              <Avatar user={actor} size={32} />
            </Link>
          ))}
        </div>
        <p>
          {first ? (
            <>
              <Link href={`/${first.handle}`}>
                <strong>{first.name}</strong>
                {first.verified && <VerifiedBadge />}
              </Link>
              {item.actors.length > 1 && (
                <>
                  {' '}
                  and {item.actors.length - 1} {item.actors.length === 2 ? 'other' : 'others'}
                </>
              )}
            </>
          ) : (
            'Someone'
          )}{' '}
          {copy}
        </p>
        {item.tweet?.text && (
          <Link
            className="notification-tweet-text"
            href={`/${item.tweet.author.handle}/status/${item.tweet.id}`}
          >
            {item.tweet.text}
          </Link>
        )}
        {item.type === 'follow_request' && first && (
          <div className="follow-request-actions">
            {requestHandled ? (
              <span>Request {requestHandled}</span>
            ) : (
              <>
                <button
                  className="button button-primary"
                  disabled={requestPending}
                  onClick={() => void respondToRequest('accept')}
                >
                  {requestPending ? <Spinner label="Updating follow request" /> : 'Accept'}
                </button>
                <button
                  className="button"
                  disabled={requestPending}
                  onClick={() => void respondToRequest('decline')}
                >
                  Decline
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function notificationCopy(type: string) {
  if (type === 'follow_request') return 'requested to follow you';
  if (type.includes('follow')) return 'followed you';
  if (type.includes('like')) return 'liked your Tweet';
  if (type.includes('retweet')) return 'Retweeted your Tweet';
  if (type.includes('quote')) return 'quoted your Tweet';
  return 'interacted with your Tweet';
}
