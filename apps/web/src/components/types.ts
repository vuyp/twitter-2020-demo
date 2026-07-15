export type User = {
  id: string;
  email?: string | undefined;
  name: string;
  handle: string;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  verified?: boolean;
  protected?: boolean;
  following?: boolean;
  followRequested?: boolean;
  followsYou?: boolean;
  blocking?: boolean;
  muting?: boolean;
  canDirectMessage?: boolean;
  createdAt?: string | null;
  followersCount?: number;
  followingCount?: number;
  tweetsCount?: number;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  role?: 'user' | 'moderator' | 'admin' | undefined;
};

export type MediaAttachment = {
  id: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  previewUrl?: string | null;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

export type Poll = {
  options: Array<{ id: string; label: string; votes: number; selected?: boolean }>;
  totalVotes: number;
  endsAt: string;
  ended?: boolean;
};

export type Tweet = {
  id: string;
  text: string;
  author: User;
  createdAt: string;
  replyToId?: string | null;
  replyToHandle?: string | null;
  quotedTweet?: Tweet | null;
  media?: MediaAttachment[];
  poll?: Poll | null;
  replyCount: number;
  retweetCount: number;
  likeCount: number;
  liked: boolean;
  retweeted: boolean;
  bookmarked: boolean;
  sensitive?: boolean;
  timelineContext?: { type: string; label?: string | undefined; user?: User | undefined } | null;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null };

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' ? (value as RecordValue) : {};
const string = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);
const bool = (value: unknown) => Boolean(value);

export function normalizeUser(value: unknown): User {
  const source = record(value);
  const relationship = record(source.relationship);
  const handle = string(source.handle || source.username).replace(/^@/, '');
  return {
    id: string(source.id),
    email: string(source.email) || undefined,
    name: string(source.name || source.displayName, handle || 'Account'),
    handle,
    bio: string(source.bio || source.description) || null,
    location: string(source.location) || null,
    website: string(source.website || source.websiteUrl || source.url) || null,
    avatarUrl: string(source.avatarUrl || source.image || source.profileImageUrl) || null,
    bannerUrl: string(source.bannerUrl || source.headerImageUrl) || null,
    verified: bool(source.verified),
    protected: bool(source.protected || source.isPrivate),
    following: bool(source.following || source.isFollowing || relationship.following),
    followRequested: bool(source.followRequested || relationship.followRequested),
    followsYou: bool(source.followsYou || relationship.followedBy),
    blocking: bool(source.blocking || relationship.blocking),
    muting: bool(source.muting || relationship.muting),
    canDirectMessage: bool(source.canDirectMessage || relationship.canDirectMessage),
    createdAt: string(source.createdAt || source.joinedAt) || null,
    followersCount: number(source.followersCount),
    followingCount: number(source.followingCount),
    tweetsCount: number(source.tweetsCount),
    twoFactorEnabled: bool(source.twoFactorEnabled),
    emailVerified: bool(source.emailVerified),
    role:
      source.role === 'moderator' || source.role === 'admin' || source.role === 'user'
        ? source.role
        : undefined,
  };
}

export function normalizeTweet(value: unknown): Tweet {
  const source = record(value);
  const metrics = record(source.metrics || source.counts);
  const viewer = record(source.viewer || source.viewerState);
  const replyToUser = record(source.replyToUser);
  const mediaSource = Array.isArray(source.media) ? source.media : [];
  const pollSource = record(source.poll);
  const options = Array.isArray(pollSource.options) ? pollSource.options : [];
  return {
    id: string(source.id),
    text: string(source.text || source.content),
    author: normalizeUser(source.author || source.user),
    createdAt: string(source.createdAt, new Date().toISOString()),
    replyToId: string(source.replyToId) || null,
    replyToHandle:
      string(source.replyToHandle || replyToUser.handle || replyToUser.username) || null,
    quotedTweet:
      source.quotedTweet || source.quoteTweet
        ? normalizeTweet(source.quotedTweet || source.quoteTweet)
        : null,
    media: mediaSource.map((item) => {
      const media = record(item);
      const rawType = string(media.type, 'image');
      return {
        id: string(media.id),
        type: rawType === 'video' || rawType === 'gif' ? rawType : 'image',
        url: string(media.url || media.src),
        previewUrl: string(media.previewUrl || media.posterUrl) || null,
        altText: string(media.altText) || null,
        width: number(media.width) || null,
        height: number(media.height) || null,
      };
    }),
    poll: options.length
      ? {
          options: options.map((item) => {
            const option = record(item);
            return {
              id: string(option.id),
              label: string(option.label || option.text),
              votes: number(option.votes || option.voteCount),
              selected: bool(option.selected),
            };
          }),
          totalVotes: number(pollSource.totalVotes),
          endsAt: string(pollSource.endsAt),
          ended: bool(pollSource.ended) || pollSource.votingStatus === 'closed',
        }
      : null,
    replyCount: number(source.replyCount || metrics.replies),
    retweetCount: number(source.retweetCount || metrics.retweets),
    likeCount: number(source.likeCount || metrics.likes),
    liked: bool(source.liked || viewer.liked),
    retweeted: bool(source.retweeted || viewer.retweeted),
    bookmarked: bool(source.bookmarked || viewer.bookmarked),
    sensitive: bool(source.sensitive),
  };
}

export function normalizeTimelineEntry(value: unknown): Tweet {
  const entry = record(value);
  const tweet = normalizeTweet(entry.tweet || value);
  const context = record(entry.context);
  if (Object.keys(context).length) {
    tweet.timelineContext = {
      type: string(context.type, 'recommended'),
      ...(typeof context.label === 'string' ? { label: context.label } : {}),
      ...(context.user ? { user: normalizeUser(context.user) } : {}),
    };
  }
  return tweet;
}
