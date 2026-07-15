/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/hooks/use-api';
import { useSession, useTheme, useToast } from '@/components/providers/app-providers';
import { Avatar, Modal, VerifiedBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { normalizeTweet, type Tweet } from '@/components/types';
import { TweetComposer } from './tweet-composer';

function relativeDate(value: string) {
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (date.getFullYear() === new Date().getFullYear())
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TweetCard({
  initialTweet,
  detail = false,
  onDelete,
}: {
  initialTweet: Tweet;
  detail?: boolean;
  onDelete?: (id: string) => void;
}) {
  const [tweet, setTweet] = useState(initialTweet);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [retweetMenuOpen, setRetweetMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const statusHref = `/${tweet.author.handle}/status/${tweet.id}`;

  const requireViewer = () => {
    if (viewer) return true;
    setMenuOpen(false);
    setRetweetMenuOpen(false);
    setReplyOpen(false);
    setQuoteOpen(false);
    router.push('/login');
    return false;
  };

  const toggle = async (kind: 'like' | 'retweet' | 'bookmark') => {
    if (!requireViewer()) return;
    const activeKey = kind === 'like' ? 'liked' : kind === 'retweet' ? 'retweeted' : 'bookmarked';
    const countKey = kind === 'like' ? 'likeCount' : kind === 'retweet' ? 'retweetCount' : null;
    const wasActive = tweet[activeKey];
    setTweet((current) => ({
      ...current,
      [activeKey]: !wasActive,
      ...(countKey ? { [countKey]: Math.max(0, current[countKey] + (wasActive ? -1 : 1)) } : {}),
    }));
    try {
      await apiFetch(`/api/v1/tweets/${tweet.id}/${kind}`, {
        method: wasActive ? 'DELETE' : 'POST',
        ...(wasActive ? {} : { body: JSON.stringify({}) }),
      });
      if (kind === 'bookmark')
        showToast(
          wasActive ? 'Tweet removed from your Bookmarks' : 'Tweet added to your Bookmarks',
        );
    } catch (reason) {
      setTweet((current) => ({
        ...current,
        [activeKey]: wasActive,
        ...(countKey ? { [countKey]: Math.max(0, current[countKey] + (wasActive ? 1 : -1)) } : {}),
      }));
      showToast(reason instanceof Error ? reason.message : 'That action didn’t work. Try again.');
    }
  };

  const remove = async () => {
    if (!requireViewer()) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/tweets/${tweet.id}`, { method: 'DELETE' });
      onDelete?.(tweet.id);
      showToast('Your Tweet was deleted');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your Tweet couldn’t be deleted.');
      setDeleting(false);
    }
  };

  const reportTweet = async () => {
    if (!requireViewer()) return;
    try {
      await apiFetch('/api/v1/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'tweet',
          targetId: tweet.id,
          reason: 'other',
          details: 'Reported from Tweet menu',
        }),
      });
      showToast('Thanks. We’ll review this Tweet.');
      setMenuOpen(false);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This report could not be sent.');
    }
  };

  const toggleFollowAuthor = async () => {
    if (!requireViewer()) return;
    const wasFollowing = Boolean(tweet.author.following);
    const wasRequested = Boolean(tweet.author.followRequested);
    try {
      const result = await apiFetch<{ state?: 'following' | 'requested' }>(
        `/api/v1/users/${tweet.author.handle}/follow`,
        {
          method: wasFollowing || wasRequested ? 'DELETE' : 'POST',
          ...(wasFollowing || wasRequested ? {} : { body: JSON.stringify({}) }),
        },
      );
      const following = !wasFollowing && !wasRequested && result.state !== 'requested';
      const followRequested = !wasFollowing && !wasRequested && result.state === 'requested';
      setTweet((current) => ({
        ...current,
        author: { ...current.author, following, followRequested },
      }));
      showToast(
        wasFollowing
          ? `You unfollowed @${tweet.author.handle}`
          : wasRequested
            ? `You cancelled your follow request to @${tweet.author.handle}`
            : followRequested
              ? `Follow request sent to @${tweet.author.handle}`
              : `You followed @${tweet.author.handle}`,
      );
      setMenuOpen(false);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This account could not be followed.');
    }
  };

  const vote = async (optionId: string) => {
    if (!requireViewer()) return;
    try {
      const updatedPoll = await apiFetch<unknown>(`/api/v1/tweets/${tweet.id}/poll`, {
        method: 'POST',
        body: JSON.stringify({ optionId }),
      });
      const updatedTweet = normalizeTweet({ ...tweet, poll: updatedPoll });
      setTweet((current) => ({ ...current, poll: updatedTweet.poll ?? null }));
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your vote could not be recorded.');
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'r') {
      event.preventDefault();
      if (requireViewer()) setReplyOpen(true);
    }
    if (event.key === 't') {
      event.preventDefault();
      void toggle('retweet');
    }
    if (event.key === 'l') {
      event.preventDefault();
      void toggle('like');
    }
    if (event.key === 'Enter') router.push(statusHref);
  };

  const openTweet = (event: React.MouseEvent<HTMLElement>) => {
    if (detail) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('a, button, input, textarea, select, video, [role="menu"]')) return;
    router.push(statusHref);
  };

  if (deleting) return null;

  return (
    <article
      className={`tweet-card ${detail ? 'tweet-detail' : ''}`}
      tabIndex={0}
      data-tweet-card
      onKeyDown={onKeyDown}
      onClick={openTweet}
      aria-label={`Tweet by ${tweet.author.name}: ${tweet.text}`}
    >
      {!detail && tweet.timelineContext && (
        <div className="tweet-context">
          <Icon
            name={tweet.timelineContext.type === 'liked' ? 'heart' : 'retweet'}
            size={16}
            fill={tweet.timelineContext.type === 'liked' ? 'currentColor' : 'none'}
          />
          <span>
            {tweet.timelineContext.user?.name || 'Someone you follow'}{' '}
            {tweet.timelineContext.label ||
              (tweet.timelineContext.type === 'liked' ? 'liked' : 'Retweeted')}
          </span>
        </div>
      )}
      {!detail && (
        <Link href={`/${tweet.author.handle}`} onClick={(event) => event.stopPropagation()}>
          <Avatar user={tweet.author} size={48} />
        </Link>
      )}
      <div className="tweet-content">
        <div className="tweet-head">
          {detail && <Avatar user={tweet.author} size={48} />}
          <div className="tweet-author-line">
            <Link href={`/${tweet.author.handle}`} className="tweet-name">
              {tweet.author.name}
              {tweet.author.verified && <VerifiedBadge />}
            </Link>
            <Link href={`/${tweet.author.handle}`} className="tweet-handle">
              @{tweet.author.handle}
            </Link>
            {!detail && (
              <>
                <span className="tweet-dot">·</span>
                <Link
                  href={statusHref}
                  className="tweet-time"
                  title={new Date(tweet.createdAt).toLocaleString()}
                >
                  {relativeDate(tweet.createdAt)}
                </Link>
              </>
            )}
          </div>
          <div className="tweet-menu-wrap">
            <button
              className="tweet-more"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="More"
            >
              <Icon name="more" size={20} />
            </button>
            {menuOpen && (
              <TweetMenu
                own={viewer?.id === tweet.author.id}
                following={Boolean(tweet.author.following)}
                followRequested={Boolean(tweet.author.followRequested)}
                bookmarked={tweet.bookmarked}
                onBookmark={() => {
                  void toggle('bookmark');
                  setMenuOpen(false);
                }}
                onDelete={() => {
                  void remove();
                  setMenuOpen(false);
                }}
                onToggleFollow={() => void toggleFollowAuthor()}
                onReport={() => void reportTweet()}
                handle={tweet.author.handle}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        </div>
        {tweet.replyToHandle && (
          <div className="replying-to-card">
            Replying to <Link href={`/${tweet.replyToHandle}`}>@{tweet.replyToHandle}</Link>
          </div>
        )}
        <div className="tweet-text">{linkify(tweet.text)}</div>
        {tweet.media && tweet.media.length > 0 && <TweetMedia tweet={tweet} />}
        {tweet.poll && <TweetPoll tweet={tweet} onVote={(optionId) => void vote(optionId)} />}
        {tweet.quotedTweet && (
          <div className="quoted-tweet">
            <TweetCard initialTweet={tweet.quotedTweet} />
          </div>
        )}
        {detail && (
          <div className="tweet-detail-time">
            <time dateTime={tweet.createdAt}>
              {new Date(tweet.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              ·{' '}
              {new Date(tweet.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </time>{' '}
            · <span>Twitter Web App</span>
          </div>
        )}
        {detail && (tweet.retweetCount > 0 || tweet.likeCount > 0) && (
          <div className="tweet-detail-counts">
            {tweet.retweetCount > 0 && (
              <span>
                <strong>{tweet.retweetCount.toLocaleString()}</strong> Retweets
              </span>
            )}
            {tweet.likeCount > 0 && (
              <span>
                <strong>{tweet.likeCount.toLocaleString()}</strong> Likes
              </span>
            )}
          </div>
        )}
        <div className="tweet-actions" aria-label="Tweet actions">
          <ActionButton
            label="Reply"
            count={tweet.replyCount}
            icon="reply"
            className="reply"
            onClick={() => {
              if (requireViewer()) setReplyOpen(true);
            }}
          />
          <span className="retweet-action-wrap">
            <ActionButton
              label="Retweet"
              count={tweet.retweetCount}
              icon="retweet"
              className="retweet"
              active={tweet.retweeted}
              onClick={() => {
                if (requireViewer()) setRetweetMenuOpen((value) => !value);
              }}
            />
            {retweetMenuOpen && (
              <span className="retweet-menu">
                <button
                  onClick={() => {
                    setRetweetMenuOpen(false);
                    void toggle('retweet');
                  }}
                >
                  <Icon name="retweet" size={19} />
                  {tweet.retweeted ? 'Undo Retweet' : 'Retweet'}
                </button>
                <button
                  onClick={() => {
                    setRetweetMenuOpen(false);
                    if (requireViewer()) setQuoteOpen(true);
                  }}
                >
                  <Icon name="feather" size={19} />
                  Quote Tweet
                </button>
              </span>
            )}
          </span>
          <ActionButton
            label="Like"
            count={tweet.likeCount}
            icon="heart"
            className="like"
            active={tweet.liked}
            fill={tweet.liked}
            onClick={() => void toggle('like')}
          />
          <ActionButton
            label="Share"
            icon="share"
            className="share"
            onClick={async () => {
              const url = `${window.location.origin}${statusHref}`;
              if (navigator.share) await navigator.share({ url }).catch(() => undefined);
              else await navigator.clipboard.writeText(url);
              showToast('Copied to clipboard');
            }}
          />
        </div>
      </div>
      <Modal
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        title="Reply"
        className="reply-modal"
      >
        <div className="modal-titlebar">
          <button className="icon-button" onClick={() => setReplyOpen(false)} aria-label="Close">
            <Icon name="close" />
          </button>
          <span />
        </div>
        <div className="reply-context">
          <TweetCard initialTweet={tweet} />
        </div>
        <TweetComposer
          autoFocus
          modal
          replyTo={tweet}
          onCreated={() => {
            setReplyOpen(false);
            setTweet((current) => ({ ...current, replyCount: current.replyCount + 1 }));
          }}
        />
      </Modal>
      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Quote Tweet">
        <div className="modal-titlebar">
          <button className="icon-button" onClick={() => setQuoteOpen(false)} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <TweetComposer autoFocus modal quoteTweet={tweet} onCreated={() => setQuoteOpen(false)} />
      </Modal>
    </article>
  );
}

function ActionButton({
  label,
  count,
  icon,
  className,
  active,
  fill,
  onClick,
}: {
  label: string;
  count?: number;
  icon: 'reply' | 'retweet' | 'heart' | 'share';
  className: string;
  active?: boolean;
  fill?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`tweet-action ${className} ${active ? 'active' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={`${label}${count ? ` (${count})` : ''}`}
      aria-pressed={active}
    >
      <span>
        <Icon name={icon} size={19} fill={fill ? 'currentColor' : 'none'} />
      </span>
      {typeof count === 'number' && count > 0 && (
        <small>{count > 9999 ? `${(count / 1000).toFixed(1)}K` : count}</small>
      )}
    </button>
  );
}

function TweetMenu({
  own,
  following,
  followRequested,
  bookmarked,
  onBookmark,
  onDelete,
  onToggleFollow,
  onReport,
  handle,
  onClose,
}: {
  own: boolean;
  following: boolean;
  followRequested: boolean;
  bookmarked: boolean;
  onBookmark: () => void;
  onDelete: () => void;
  onToggleFollow: () => void;
  onReport: () => void;
  handle: string;
  onClose: () => void;
}) {
  return (
    <div className="tweet-menu" role="menu" onMouseLeave={onClose}>
      {own && (
        <button role="menuitem" className="danger" onClick={onDelete}>
          <Icon name="trash" size={20} />
          Delete
        </button>
      )}
      <button role="menuitem" onClick={onBookmark}>
        <Icon name="bookmark" size={20} />
        {bookmarked ? 'Remove Tweet from Bookmarks' : 'Add Tweet to Bookmarks'}
      </button>
      {!own && (
        <>
          <button role="menuitem" onClick={onToggleFollow}>
            <Icon name="user" size={20} />
            {following ? 'Unfollow' : followRequested ? 'Cancel follow request to' : 'Follow'} @
            {handle}
          </button>
          <button role="menuitem" onClick={onReport}>
            <Icon name="warning" size={20} />
            Report Tweet
          </button>
        </>
      )}
    </div>
  );
}

function TweetMedia({ tweet }: { tweet: Tweet }) {
  const { autoplayVideo } = useTheme();
  return (
    <div className={`tweet-media tweet-media-${tweet.media?.length || 0}`}>
      {tweet.media?.map((item) =>
        item.type === 'video' ? (
          <video
            key={item.id || item.url}
            controls
            autoPlay={autoplayVideo}
            muted={autoplayVideo}
            playsInline
            preload="metadata"
            poster={item.previewUrl || undefined}
          >
            <source src={item.url} />
          </video>
        ) : (
          <a
            key={item.id || item.url}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={item.url} alt={item.altText || ''} />
          </a>
        ),
      )}
    </div>
  );
}

function TweetPoll({ tweet, onVote }: { tweet: Tweet; onVote: (optionId: string) => void }) {
  const poll = tweet.poll;
  if (!poll) return null;
  const max = Math.max(...poll.options.map((option) => option.votes), 1);
  return (
    <div className="tweet-poll">
      {poll.options.map((option) => (
        <button
          key={option.id}
          disabled={poll.ended || poll.options.some((item) => item.selected)}
          onClick={() => onVote(option.id)}
          style={{ '--poll-width': `${(option.votes / max) * 100}%` } as React.CSSProperties}
        >
          <span>{option.label}</span>
          {poll.totalVotes > 0 && (
            <strong>{Math.round((option.votes / poll.totalVotes) * 100)}%</strong>
          )}
        </button>
      ))}
      <small>
        {poll.totalVotes.toLocaleString()} votes ·{' '}
        {poll.ended ? 'Final results' : 'Poll in progress'}
      </small>
    </div>
  );
}

function linkify(text: string) {
  const parts = text.split(/((?:https?:\/\/[^\s]+)|(?:@[A-Za-z0-9_]{1,15})|(?:#[\p{L}\p{N}_]+))/gu);
  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part))
      return (
        <a key={index} href={part} target="_blank" rel="nofollow noopener noreferrer">
          {part.replace(/^https?:\/\/(www\.)?/, '')}
        </a>
      );
    if (part.startsWith('@'))
      return (
        <Link key={index} href={`/${part.slice(1)}`}>
          {part}
        </Link>
      );
    if (part.startsWith('#'))
      return (
        <Link key={index} href={`/search?q=${encodeURIComponent(part)}`}>
          {part}
        </Link>
      );
    return part;
  });
}
