import { relations, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const entityId = (name = 'id') => bigserial(name, { mode: 'bigint' });
const foreignEntityId = (name: string) => bigint(name, { mode: 'bigint' });

export const accountStatus = pgEnum('account_status', ['active', 'deactivated', 'suspended']);
export const userRole = pgEnum('user_role', ['user', 'moderator', 'admin']);
export const colorScheme = pgEnum('color_scheme', ['light', 'dim', 'lights_out']);
export const accentColor = pgEnum('accent_color', [
  'blue',
  'yellow',
  'pink',
  'purple',
  'orange',
  'green',
]);
export const fontSize = pgEnum('font_size', [
  'extra_small',
  'small',
  'default',
  'large',
  'extra_large',
]);
export const dmPermission = pgEnum('dm_permission', ['everyone', 'following', 'nobody']);
export const timelineMode = pgEnum('timeline_mode', ['top', 'latest']);
export const replyAudience = pgEnum('reply_audience', ['everyone', 'following', 'mentioned']);
export const mediaType = pgEnum('media_type', ['image', 'gif', 'video']);
export const mediaStatus = pgEnum('media_status', ['pending', 'processing', 'ready', 'failed']);
export const listVisibility = pgEnum('list_visibility', ['public', 'private']);
export const momentStatus = pgEnum('moment_status', ['draft', 'published', 'unlisted']);
export const notificationType = pgEnum('notification_type', [
  'follow',
  'follow_request',
  'like',
  'retweet',
  'quote',
  'reply',
  'mention',
  'poll_vote',
  'dm',
  'system',
]);
export const conversationType = pgEnum('conversation_type', ['direct', 'group']);
export const messageType = pgEnum('message_type', ['text', 'media', 'system']);
export const reportReason = pgEnum('report_reason', [
  'spam',
  'abusive',
  'self_harm',
  'sensitive_media',
  'impersonation',
  'copyright',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed']);
export const scheduledTweetStatus = pgEnum('scheduled_tweet_status', [
  'scheduled',
  'publishing',
  'published',
  'cancelled',
  'failed',
]);
export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);
export const exportStatus = pgEnum('export_status', [
  'pending',
  'processing',
  'ready',
  'expired',
  'failed',
]);

/** Better Auth user model plus the minimum moderation/account-lifecycle fields. */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    twoFactorEnabled: boolean('twoFactorEnabled').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
    role: userRole('role').notNull().default('user'),
    status: accountStatus('status').notNull().default('active'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('banReason'),
    banExpires: timestamp('banExpires', { withTimezone: true }),
    deactivatedAt: timestamp('deactivatedAt', { withTimezone: true }),
    deletionScheduledAt: timestamp('deletionScheduledAt', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),
    index('users_status_idx').on(table.status),
  ],
);

/** Better Auth session model. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_idx').on(table.userId),
  ],
);

/** Better Auth provider/credential account model. */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('accounts_provider_account_unique').on(table.providerId, table.accountId),
    index('accounts_user_idx').on(table.userId),
  ],
);

/** Better Auth email/recovery verification model. */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

/** Better Auth two-factor plugin model. */
export const twoFactors = pgTable(
  'two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: boolean('verified').notNull().default(false),
    failedVerificationCount: integer('failedVerificationCount').notNull().default(0),
    lockedUntil: timestamp('lockedUntil', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('two_factors_user_unique').on(table.userId),
    index('two_factors_secret_idx').on(table.secret),
    check('two_factors_failed_count_nonnegative', sql`${table.failedVerificationCount} >= 0`),
  ],
);

export const settings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  protectedAccount: boolean('protected_account').notNull().default(false),
  discoverableByEmail: boolean('discoverable_by_email').notNull().default(true),
  allowPhotoTagging: boolean('allow_photo_tagging').notNull().default(true),
  directMessagePermission: dmPermission('direct_message_permission').notNull().default('following'),
  showReadReceipts: boolean('show_read_receipts').notNull().default(true),
  showSensitiveMedia: boolean('show_sensitive_media').notNull().default(false),
  personalizeAds: boolean('personalize_ads').notNull().default(true),
  colorScheme: colorScheme('color_scheme').notNull().default('light'),
  accentColor: accentColor('accent_color').notNull().default('blue'),
  fontSize: fontSize('font_size').notNull().default('default'),
  reduceMotion: boolean('reduce_motion').notNull().default(false),
  autoplayVideo: boolean('autoplay_video').notNull().default(true),
  defaultTimeline: timelineMode('default_timeline').notNull().default('top'),
  notificationPushEnabled: boolean('notification_push_enabled').notNull().default(true),
  notificationEmailEnabled: boolean('notification_email_enabled').notNull().default(true),
  notificationLikes: boolean('notification_likes').notNull().default(true),
  notificationRetweets: boolean('notification_retweets').notNull().default(true),
  notificationFollows: boolean('notification_follows').notNull().default(true),
  notificationMentions: boolean('notification_mentions').notNull().default(true),
  notificationDirectMessages: boolean('notification_direct_messages').notNull().default(true),
  language: varchar('language', { length: 16 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const media = pgTable(
  'media',
  {
    id: entityId().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mediaType('type').notNull(),
    status: mediaStatus('status').notNull().default('pending'),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename'),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    byteSize: bigint('byte_size', { mode: 'bigint' }).notNull(),
    checksum: varchar('checksum', { length: 128 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    variants: jsonb('variants').$type<Record<string, unknown>>().notNull().default({}),
    processingError: text('processing_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('media_storage_key_unique').on(table.storageKey),
    index('media_owner_created_idx').on(table.ownerId, table.createdAt),
    index('media_status_idx').on(table.status),
    check('media_byte_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export const tweets = pgTable(
  'tweets',
  {
    id: entityId().primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    replyToTweetId: foreignEntityId('reply_to_tweet_id').references((): AnyPgColumn => tweets.id, {
      onDelete: 'set null',
    }),
    quotedTweetId: foreignEntityId('quoted_tweet_id').references((): AnyPgColumn => tweets.id, {
      onDelete: 'set null',
    }),
    threadRootId: foreignEntityId('thread_root_id').references((): AnyPgColumn => tweets.id, {
      onDelete: 'set null',
    }),
    replyAudience: replyAudience('reply_audience').notNull().default('everyone'),
    language: varchar('language', { length: 16 }),
    source: varchar('source', { length: 64 }).notNull().default('Twitter Web App'),
    isSensitive: boolean('is_sensitive').notNull().default(false),
    replyCount: integer('reply_count').notNull().default(0),
    retweetCount: integer('retweet_count').notNull().default(0),
    quoteCount: integer('quote_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
    bookmarkCount: integer('bookmark_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('tweets_author_published_idx').on(table.authorId, table.publishedAt, table.id),
    index('tweets_reply_parent_idx').on(table.replyToTweetId, table.publishedAt),
    index('tweets_thread_root_idx').on(table.threadRootId, table.publishedAt),
    index('tweets_published_idx').on(table.publishedAt, table.id),
    index('tweets_search_idx').using('gin', sql`to_tsvector('english', ${table.body})`),
    check(
      'tweets_nonnegative_counts',
      sql`${table.replyCount} >= 0 AND ${table.retweetCount} >= 0 AND ${table.quoteCount} >= 0 AND ${table.likeCount} >= 0 AND ${table.bookmarkCount} >= 0`,
    ),
  ],
);

export const profiles = pgTable(
  'profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    handle: varchar('handle', { length: 15 }),
    displayName: varchar('display_name', { length: 50 }).notNull(),
    bio: varchar('bio', { length: 160 }).notNull().default(''),
    location: varchar('location', { length: 30 }).notNull().default(''),
    website: text('website'),
    birthDate: timestamp('birth_date', { withTimezone: true }),
    avatarMediaId: foreignEntityId('avatar_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    bannerMediaId: foreignEntityId('banner_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    pinnedTweetId: foreignEntityId('pinned_tweet_id').references(() => tweets.id, {
      onDelete: 'set null',
    }),
    followerCount: integer('follower_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    tweetCount: integer('tweet_count').notNull().default(0),
    listedCount: integer('listed_count').notNull().default(0),
    verified: boolean('verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('profiles_handle_lower_unique')
      .on(sql`lower(${table.handle})`)
      .where(sql`${table.handle} IS NOT NULL`),
    index('profiles_display_name_idx').on(table.displayName),
    check(
      'profiles_handle_format',
      sql`${table.handle} IS NULL OR ${table.handle} ~ '^[A-Za-z0-9_]{1,15}$'`,
    ),
    check(
      'profiles_nonnegative_counts',
      sql`${table.followerCount} >= 0 AND ${table.followingCount} >= 0 AND ${table.tweetCount} >= 0 AND ${table.listedCount} >= 0`,
    ),
  ],
);

export const tweetMedia = pgTable(
  'tweet_media',
  {
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    mediaId: foreignEntityId('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    altText: varchar('alt_text', { length: 1000 }),
  },
  (table) => [
    primaryKey({ columns: [table.tweetId, table.mediaId] }),
    uniqueIndex('tweet_media_position_unique').on(table.tweetId, table.position),
    check('tweet_media_position_range', sql`${table.position} BETWEEN 0 AND 3`),
  ],
);

export const polls = pgTable(
  'polls',
  {
    id: entityId().primaryKey(),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    voteCount: integer('vote_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('polls_tweet_unique').on(table.tweetId),
    index('polls_ends_idx').on(table.endsAt),
    check('polls_vote_count_nonnegative', sql`${table.voteCount} >= 0`),
  ],
);

export const pollOptions = pgTable(
  'poll_options',
  {
    id: entityId().primaryKey(),
    pollId: foreignEntityId('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: varchar('label', { length: 25 }).notNull(),
    voteCount: integer('vote_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('poll_options_position_unique').on(table.pollId, table.position),
    check('poll_options_position_range', sql`${table.position} BETWEEN 0 AND 3`),
    check('poll_options_vote_count_nonnegative', sql`${table.voteCount} >= 0`),
  ],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: foreignEntityId('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: foreignEntityId('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    voterId: text('voter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.pollId, table.voterId] }),
    index('poll_votes_option_idx').on(table.optionId),
  ],
);

export const tweetMentions = pgTable(
  'tweet_mentions',
  {
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    start: integer('start_offset').notNull(),
    end: integer('end_offset').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tweetId, table.userId, table.start] }),
    index('tweet_mentions_user_idx').on(table.userId, table.tweetId),
    check(
      'tweet_mentions_offsets_valid',
      sql`${table.start} >= 0 AND ${table.end} > ${table.start}`,
    ),
  ],
);

export const hashtags = pgTable(
  'hashtags',
  {
    id: entityId().primaryKey(),
    tag: varchar('tag', { length: 100 }).notNull(),
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hashtags_tag_lower_unique').on(sql`lower(${table.tag})`),
    index('hashtags_activity_idx').on(table.lastUsedAt, table.useCount),
  ],
);

export const tweetHashtags = pgTable(
  'tweet_hashtags',
  {
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    hashtagId: foreignEntityId('hashtag_id')
      .notNull()
      .references(() => hashtags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.tweetId, table.hashtagId] }),
    index('tweet_hashtags_tag_idx').on(table.hashtagId, table.tweetId),
  ],
);

export const linkPreviews = pgTable('link_previews', {
  id: entityId().primaryKey(),
  canonicalUrl: text('canonical_url').notNull(),
  displayUrl: text('display_url').notNull(),
  title: varchar('title', { length: 280 }),
  description: varchar('description', { length: 500 }),
  siteName: varchar('site_name', { length: 100 }),
  imageMediaId: foreignEntityId('image_media_id').references(() => media.id, {
    onDelete: 'set null',
  }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tweetLinks = pgTable(
  'tweet_links',
  {
    id: entityId().primaryKey(),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    expandedUrl: text('expanded_url').notNull(),
    displayUrl: text('display_url').notNull(),
    start: integer('start_offset').notNull(),
    end: integer('end_offset').notNull(),
    previewId: foreignEntityId('preview_id').references(() => linkPreviews.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('tweet_links_tweet_idx').on(table.tweetId),
    check('tweet_links_offsets_valid', sql`${table.start} >= 0 AND ${table.end} > ${table.start}`),
  ],
);

export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: text('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notificationsEnabled: boolean('notifications_enabled').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index('follows_following_idx').on(table.followingId, table.createdAt),
    check('follows_not_self', sql`${table.followerId} <> ${table.followingId}`),
  ],
);

export const followRequests = pgTable(
  'follow_requests',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: text('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.requesterId, table.targetId] }),
    index('follow_requests_target_idx').on(table.targetId, table.createdAt),
    check('follow_requests_not_self', sql`${table.requesterId} <> ${table.targetId}`),
  ],
);

export const likes = pgTable(
  'likes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tweetId] }),
    index('likes_tweet_idx').on(table.tweetId, table.createdAt),
  ],
);

export const retweets = pgTable(
  'retweets',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tweetId] }),
    index('retweets_tweet_idx').on(table.tweetId, table.createdAt),
  ],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tweetId] }),
    index('bookmarks_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index('blocks_blocked_idx').on(table.blockedId),
    check('blocks_not_self', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);

export const mutes = pgTable(
  'mutes',
  {
    muterId: text('muter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mutedId: text('muted_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.muterId, table.mutedId] }),
    index('mutes_muted_idx').on(table.mutedId),
    check('mutes_not_self', sql`${table.muterId} <> ${table.mutedId}`),
  ],
);

export const mutedWords = pgTable(
  'muted_words',
  {
    id: entityId().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phrase: varchar('phrase', { length: 140 }).notNull(),
    muteHome: boolean('mute_home').notNull().default(true),
    muteNotifications: boolean('mute_notifications').notNull().default(true),
    fromNonFollowersOnly: boolean('from_non_followers_only').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('muted_words_user_phrase_unique').on(table.userId, sql`lower(${table.phrase})`),
  ],
);

export const topics = pgTable(
  'topics',
  {
    id: entityId().primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    parentId: foreignEntityId('parent_id').references((): AnyPgColumn => topics.id, {
      onDelete: 'set null',
    }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('topics_slug_unique').on(table.slug),
    index('topics_parent_idx').on(table.parentId),
  ],
);

export const userTopics = pgTable(
  'user_topics',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: foreignEntityId('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.topicId] }),
    index('user_topics_topic_idx').on(table.topicId),
  ],
);

export const topicTweets = pgTable(
  'topic_tweets',
  {
    topicId: foreignEntityId('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    confidence: integer('confidence').notNull().default(100),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.topicId, table.tweetId] }),
    index('topic_tweets_tweet_idx').on(table.tweetId),
    check('topic_tweets_confidence_range', sql`${table.confidence} BETWEEN 0 AND 100`),
  ],
);

export const lists = pgTable(
  'lists',
  {
    id: entityId().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 25 }).notNull(),
    description: varchar('description', { length: 100 }).notNull().default(''),
    visibility: listVisibility('visibility').notNull().default('public'),
    bannerMediaId: foreignEntityId('banner_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    memberCount: integer('member_count').notNull().default(0),
    followerCount: integer('follower_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('lists_owner_created_idx').on(table.ownerId, table.createdAt),
    check(
      'lists_nonnegative_counts',
      sql`${table.memberCount} >= 0 AND ${table.followerCount} >= 0`,
    ),
  ],
);

export const listMembers = pgTable(
  'list_members',
  {
    listId: foreignEntityId('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedById: text('added_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index('list_members_user_idx').on(table.userId),
  ],
);

export const listFollowers = pgTable(
  'list_followers',
  {
    listId: foreignEntityId('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index('list_followers_user_idx').on(table.userId),
  ],
);

export const moments = pgTable(
  'moments',
  {
    id: entityId().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 75 }).notNull(),
    description: varchar('description', { length: 250 }).notNull().default(''),
    coverMediaId: foreignEntityId('cover_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    status: momentStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('moments_owner_created_idx').on(table.ownerId, table.createdAt),
    index('moments_status_published_idx').on(table.status, table.publishedAt),
  ],
);

export const momentTweets = pgTable(
  'moment_tweets',
  {
    momentId: foreignEntityId('moment_id')
      .notNull()
      .references(() => moments.id, { onDelete: 'cascade' }),
    tweetId: foreignEntityId('tweet_id')
      .notNull()
      .references(() => tweets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.momentId, table.tweetId] }),
    uniqueIndex('moment_tweets_position_unique').on(table.momentId, table.position),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: entityId().primaryKey(),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: notificationType('type').notNull(),
    tweetId: foreignEntityId('tweet_id').references(() => tweets.id, { onDelete: 'cascade' }),
    message: text('message'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('notifications_dedupe_unique').on(table.recipientId, table.dedupeKey),
    index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt, table.id),
    index('notifications_unread_idx').on(table.recipientId, table.readAt),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: entityId().primaryKey(),
    type: conversationType('type').notNull().default('direct'),
    title: varchar('title', { length: 50 }),
    avatarMediaId: foreignEntityId('avatar_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    createdById: text('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('conversations_last_message_idx').on(table.lastMessageAt, table.id)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: foreignEntityId('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    lastReadMessageId: foreignEntityId('last_read_message_id'),
    notificationsMutedUntil: timestamp('notifications_muted_until', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_members_user_idx').on(table.userId, table.leftAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: entityId().primaryKey(),
    conversationId: foreignEntityId('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: messageType('type').notNull().default('text'),
    body: text('body').notNull().default(''),
    replyToMessageId: foreignEntityId('reply_to_message_id').references(
      (): AnyPgColumn => messages.id,
      {
        onDelete: 'set null',
      },
    ),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('messages_conversation_sent_idx').on(table.conversationId, table.sentAt, table.id),
    index('messages_sender_idx').on(table.senderId, table.sentAt),
  ],
);

export const messageMedia = pgTable(
  'message_media',
  {
    messageId: foreignEntityId('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mediaId: foreignEntityId('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.mediaId] }),
    uniqueIndex('message_media_position_unique').on(table.messageId, table.position),
  ],
);

export const messageReads = pgTable(
  'message_reads',
  {
    messageId: foreignEntityId('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('message_reads_user_idx').on(table.userId, table.readAt),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: entityId().primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetTweetId: foreignEntityId('target_tweet_id').references(() => tweets.id, {
      onDelete: 'set null',
    }),
    targetMessageId: foreignEntityId('target_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    reason: reportReason('reason').notNull(),
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),
    assignedToId: text('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('reports_status_created_idx').on(table.status, table.createdAt),
    index('reports_reporter_idx').on(table.reporterId, table.createdAt),
    check(
      'reports_has_target',
      sql`num_nonnulls(${table.targetUserId}, ${table.targetTweetId}, ${table.targetMessageId}) = 1`,
    ),
  ],
);

export const reportActions = pgTable(
  'report_actions',
  {
    id: entityId().primaryKey(),
    reportId: foreignEntityId('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 50 }).notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [index('report_actions_report_idx').on(table.reportId, table.createdAt)],
);

export type TweetComposition = {
  body: string;
  mediaIds?: string[];
  poll?: { options: string[]; durationMinutes: number };
  replyToTweetId?: string;
  quotedTweetId?: string;
  replyAudience?: 'everyone' | 'following' | 'mentioned';
  isSensitive?: boolean;
};

export const scheduledTweets = pgTable(
  'scheduled_tweets',
  {
    id: entityId().primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<TweetComposition>().notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    status: scheduledTweetStatus('status').notNull().default('scheduled'),
    publishedTweetId: foreignEntityId('published_tweet_id').references(() => tweets.id, {
      onDelete: 'set null',
    }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('scheduled_tweets_due_idx').on(table.status, table.scheduledFor),
    index('scheduled_tweets_author_idx').on(table.authorId, table.createdAt),
    check('scheduled_tweets_attempts_nonnegative', sql`${table.attempts} >= 0`),
  ],
);

export const tweetDrafts = pgTable(
  'tweet_drafts',
  {
    id: entityId().primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<TweetComposition>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('tweet_drafts_author_updated_idx').on(table.authorId, table.updatedAt)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (table) => [
    index('outbox_events_dispatch_idx').on(table.status, table.availableAt),
    index('outbox_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
    check('outbox_events_attempts_nonnegative', sql`${table.attempts} >= 0`),
  ],
);

export const archiveExports = pgTable(
  'archive_exports',
  {
    id: entityId().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: exportStatus('status').notNull().default('pending'),
    storageKey: text('storage_key'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [index('archive_exports_user_requested_idx').on(table.userId, table.requestedAt)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  settings: one(settings, { fields: [users.id], references: [settings.userId] }),
  sessions: many(sessions),
  accounts: many(accounts),
  tweets: many(tweets),
  media: many(media),
  likes: many(likes),
  bookmarks: many(bookmarks),
  notifications: many(notifications, { relationName: 'notificationRecipient' }),
  conversations: many(conversationMembers),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
  avatar: one(media, {
    fields: [profiles.avatarMediaId],
    references: [media.id],
    relationName: 'profileAvatar',
  }),
  banner: one(media, {
    fields: [profiles.bannerMediaId],
    references: [media.id],
    relationName: 'profileBanner',
  }),
  pinnedTweet: one(tweets, { fields: [profiles.pinnedTweetId], references: [tweets.id] }),
}));

export const tweetsRelations = relations(tweets, ({ one, many }) => ({
  author: one(users, { fields: [tweets.authorId], references: [users.id] }),
  replyTo: one(tweets, {
    fields: [tweets.replyToTweetId],
    references: [tweets.id],
    relationName: 'tweetReplies',
  }),
  replies: many(tweets, { relationName: 'tweetReplies' }),
  quotedTweet: one(tweets, {
    fields: [tweets.quotedTweetId],
    references: [tweets.id],
    relationName: 'tweetQuotes',
  }),
  quotes: many(tweets, { relationName: 'tweetQuotes' }),
  media: many(tweetMedia),
  poll: one(polls, { fields: [tweets.id], references: [polls.tweetId] }),
  likes: many(likes),
  retweets: many(retweets),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
  owner: one(users, { fields: [media.ownerId], references: [users.id] }),
  tweets: many(tweetMedia),
  messages: many(messageMedia),
}));

export const tweetMediaRelations = relations(tweetMedia, ({ one }) => ({
  tweet: one(tweets, { fields: [tweetMedia.tweetId], references: [tweets.id] }),
  media: one(media, { fields: [tweetMedia.mediaId], references: [media.id] }),
}));

export const pollsRelations = relations(polls, ({ one, many }) => ({
  tweet: one(tweets, { fields: [polls.tweetId], references: [tweets.id] }),
  options: many(pollOptions),
  votes: many(pollVotes),
}));

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(polls, { fields: [pollOptions.pollId], references: [polls.id] }),
  votes: many(pollVotes),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'userFollowing',
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'userFollowers',
  }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  owner: one(users, { fields: [lists.ownerId], references: [users.id] }),
  members: many(listMembers),
  followers: many(listFollowers),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  creator: one(users, { fields: [conversations.createdById], references: [users.id] }),
  members: many(conversationMembers),
  messages: many(messages),
}));

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [conversationMembers.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  replyTo: one(messages, {
    fields: [messages.replyToMessageId],
    references: [messages.id],
    relationName: 'messageReplies',
  }),
  replies: many(messages, { relationName: 'messageReplies' }),
  media: many(messageMedia),
  reads: many(messageReads),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Tweet = typeof tweets.$inferSelect;
export type NewTweet = typeof tweets.$inferInsert;
export type Media = typeof media.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
