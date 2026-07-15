import {
  archiveExports,
  blocks,
  bookmarks,
  closeDb,
  conversationMembers,
  conversations,
  db,
  follows,
  hashtags,
  likes,
  media,
  messages,
  notifications,
  outboxEvents,
  pollOptions,
  polls,
  profiles,
  scheduledTweets,
  settings,
  tweetMedia,
  tweetHashtags,
  tweetMentions,
  tweets,
  users,
} from '@twitter2020/db';
import { Queue, Worker, type Job } from 'bullmq';
import { strToU8, zipSync } from 'fflate';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { loadConfig } from './config.js';
import { createStorage } from './storage.js';

const config = loadConfig();
const storage = createStorage(config);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const redisUrl = new URL(config.redisUrl);
const queueConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  maxRetriesPerRequest: null,
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};
const mailer = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort });

const maintenanceQueue = new Queue('twitter-maintenance', { connection: queueConnection });
const mediaQueue = new Queue('twitter-media', { connection: queueConnection });
const mailQueue = new Queue('twitter-mail', { connection: queueConnection });
const archiveQueue = new Queue('twitter-archive', { connection: queueConnection });

await Promise.all([
  maintenanceQueue.add(
    'dispatch-outbox',
    {},
    { repeat: { every: 2_000 }, jobId: 'dispatch-outbox' },
  ),
  maintenanceQueue.add(
    'publish-scheduled',
    {},
    { repeat: { every: 5_000 }, jobId: 'publish-scheduled' },
  ),
  maintenanceQueue.add(
    'refresh-trends',
    {},
    { repeat: { every: 60_000 }, jobId: 'refresh-trends' },
  ),
  maintenanceQueue.add('cleanup', {}, { repeat: { every: 3_600_000 }, jobId: 'cleanup' }),
]);

const maintenanceWorker = new Worker(
  'twitter-maintenance',
  async (job) => {
    switch (job.name) {
      case 'dispatch-outbox':
        return dispatchOutbox();
      case 'publish-scheduled':
        return publishScheduledTweets();
      case 'refresh-trends':
        return refreshTrends();
      case 'cleanup':
        return cleanupExpiredData();
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  },
  { connection: queueConnection, concurrency: 1 },
);

const mediaWorker = new Worker(
  'twitter-media',
  async (job: Job<{ mediaId: string }>) => processMedia(job.data.mediaId),
  { connection: queueConnection, concurrency: 2 },
);

const mailWorker = new Worker(
  'twitter-mail',
  async (job: Job<{ to: string; subject: string; text: string; html?: string }>) => {
    await mailer.sendMail({ from: config.smtpFrom, ...job.data });
  },
  { connection: queueConnection, concurrency: 4 },
);

const archiveWorker = new Worker(
  'twitter-archive',
  async (job: Job<{ exportId: string }>) => buildArchive(job.data.exportId),
  { connection: queueConnection, concurrency: 1 },
);

async function dispatchOutbox() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  await db
    .update(outboxEvents)
    .set({ status: 'pending', lockedAt: null, availableAt: now })
    .where(and(eq(outboxEvents.status, 'processing'), lte(outboxEvents.lockedAt, staleBefore)));
  const candidates = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.availableAt, now)))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(50);

  for (const event of candidates) {
    const claimed = await db
      .update(outboxEvents)
      .set({ status: 'processing', lockedAt: now, attempts: event.attempts + 1 })
      .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'pending')))
      .returning({ id: outboxEvents.id });
    if (claimed.length === 0) continue;

    try {
      await routeOutboxEvent(event.eventType, event.payload, event.id);
      await db
        .update(outboxEvents)
        .set({ status: 'completed', processedAt: new Date(), lockedAt: null, lastError: null })
        .where(eq(outboxEvents.id, event.id));
    } catch (error) {
      const failed = event.attempts + 1 >= 8;
      const retryDelay = Math.min(3_600, 5 * 2 ** event.attempts);
      await db
        .update(outboxEvents)
        .set({
          status: failed ? 'failed' : 'pending',
          availableAt: new Date(Date.now() + retryDelay * 1_000),
          lockedAt: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown outbox error',
        })
        .where(eq(outboxEvents.id, event.id));
    }
  }
  return { processed: candidates.length };
}

async function routeOutboxEvent(type: string, payload: Record<string, unknown>, eventId: string) {
  if (type === 'media.created' && typeof payload.mediaId === 'string') {
    await mediaQueue.add('process', { mediaId: payload.mediaId }, queueOptions(eventId));
    return;
  }
  if (type === 'email.send' && isMailPayload(payload)) {
    await mailQueue.add('send', payload, queueOptions(eventId));
    return;
  }
  if (type === 'archive.requested' && typeof payload.exportId === 'string') {
    await archiveQueue.add('build', { exportId: payload.exportId }, queueOptions(eventId));
    return;
  }

  const recipients = new Set<string>();
  if (typeof payload.recipientId === 'string') recipients.add(payload.recipientId);
  if (Array.isArray(payload.recipientIds)) {
    for (const value of payload.recipientIds) if (typeof value === 'string') recipients.add(value);
  }
  if (
    type === 'dm.read' &&
    typeof payload.conversationId === 'string' &&
    /^\d+$/.test(payload.conversationId)
  ) {
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, BigInt(payload.conversationId)),
          isNull(conversationMembers.leftAt),
        ),
      );
    for (const member of members) {
      if (member.userId !== payload.userId) recipients.add(member.userId);
    }
  }
  if (
    (type === 'timeline.new' || type === 'tweet.published') &&
    typeof payload.authorId === 'string'
  ) {
    recipients.add(payload.authorId);
    const followers = await db
      .select({ userId: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, payload.authorId));
    for (const follower of followers) recipients.add(follower.userId);
  }
  if (type === 'notification.created' && typeof payload.recipientId === 'string') {
    await queueNotificationEmail(payload, eventId);
  }
  for (const recipientId of recipients) {
    await redis.publish(
      `realtime:user:${recipientId}`,
      JSON.stringify({ type, payload: serialize(payload) }),
    );
  }
}

async function queueNotificationEmail(payload: Record<string, unknown>, eventId: string) {
  const recipientId = payload.recipientId;
  if (typeof recipientId !== 'string') return;
  const [recipient] = await db
    .select({
      email: users.email,
      emailVerified: users.emailVerified,
      emailEnabled: settings.notificationEmailEnabled,
    })
    .from(users)
    .leftJoin(settings, eq(settings.userId, users.id))
    .where(eq(users.id, recipientId))
    .limit(1);
  if (!recipient?.emailVerified || recipient.emailEnabled === false) return;

  const actorId = typeof payload.actorId === 'string' ? payload.actorId : null;
  const [actor] = actorId
    ? await db
        .select({ name: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.userId, actorId))
        .limit(1)
    : [];
  const actorName = (actor?.name || 'Someone').replace(/[\r\n]+/g, ' ');
  const kind = typeof payload.type === 'string' ? payload.type : 'notification';
  const action =
    {
      follow: 'followed you',
      follow_request: 'requested to follow you',
      like: 'liked your Tweet',
      retweet: 'Retweeted your Tweet',
      quote: 'quoted your Tweet',
      reply: 'replied to your Tweet',
      mention: 'mentioned you in a Tweet',
      poll_vote: 'voted in your poll',
      dm: 'sent you a Direct Message',
    }[kind] || 'sent you a notification';
  const text = `${actorName} ${action}. Open Twitter to see what happened.`;
  await mailQueue.add(
    'notification',
    {
      to: recipient.email,
      subject: `${actorName} ${action}`,
      text,
      html: `<p>${escapeHtml(text)}</p><p><a href="${config.appUrl}/notifications">View on Twitter</a></p>`,
    },
    queueOptions(`notification-email:${eventId}`),
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!;
  });
}

async function publishScheduledTweets() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  await db
    .update(scheduledTweets)
    .set({ status: 'scheduled', lockedAt: null })
    .where(
      and(eq(scheduledTweets.status, 'publishing'), lte(scheduledTweets.lockedAt, staleBefore)),
    );
  const due = await db
    .select()
    .from(scheduledTweets)
    .where(
      and(eq(scheduledTweets.status, 'scheduled'), lte(scheduledTweets.scheduledFor, new Date())),
    )
    .orderBy(asc(scheduledTweets.scheduledFor))
    .limit(20);

  for (const scheduled of due) {
    const claimed = await db
      .update(scheduledTweets)
      .set({ status: 'publishing', lockedAt: new Date(), attempts: scheduled.attempts + 1 })
      .where(and(eq(scheduledTweets.id, scheduled.id), eq(scheduledTweets.status, 'scheduled')))
      .returning({ id: scheduledTweets.id });
    if (claimed.length === 0) continue;

    try {
      await db.transaction(async (tx) => {
        const payload = scheduled.payload;
        const replyTo = payload.replyToTweetId ? BigInt(payload.replyToTweetId) : null;
        const quoted = payload.quotedTweetId ? BigInt(payload.quotedTweetId) : null;
        const [author] = await tx
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, scheduled.authorId))
          .limit(1);
        if (author?.status !== 'active') {
          throw new Error('Scheduled Tweet author is not active');
        }

        const validateTarget = async (targetId: bigint, reply: boolean) => {
          const [target] = await tx
            .select({
              authorId: tweets.authorId,
              threadRootId: tweets.threadRootId,
              replyAudience: tweets.replyAudience,
              authorStatus: users.status,
              protectedAccount: settings.protectedAccount,
            })
            .from(tweets)
            .innerJoin(users, eq(users.id, tweets.authorId))
            .leftJoin(settings, eq(settings.userId, tweets.authorId))
            .where(and(eq(tweets.id, targetId), isNull(tweets.deletedAt)))
            .limit(1);
          if (!target || target.authorStatus !== 'active') {
            throw new Error('Scheduled Tweet target is no longer available');
          }
          const [blocked] = await tx
            .select({ blockerId: blocks.blockerId })
            .from(blocks)
            .where(
              or(
                and(
                  eq(blocks.blockerId, scheduled.authorId),
                  eq(blocks.blockedId, target.authorId),
                ),
                and(
                  eq(blocks.blockerId, target.authorId),
                  eq(blocks.blockedId, scheduled.authorId),
                ),
              ),
            )
            .limit(1);
          if (blocked) throw new Error('Scheduled Tweet target is blocked');
          if (target.protectedAccount && target.authorId !== scheduled.authorId) {
            const [following] = await tx
              .select({ followerId: follows.followerId })
              .from(follows)
              .where(
                and(
                  eq(follows.followerId, scheduled.authorId),
                  eq(follows.followingId, target.authorId),
                ),
              )
              .limit(1);
            if (!following) throw new Error('Scheduled Tweet target is protected');
          }
          if (reply && target.authorId !== scheduled.authorId) {
            if (target.replyAudience === 'following') {
              const [allowed] = await tx
                .select({ followerId: follows.followerId })
                .from(follows)
                .where(
                  and(
                    eq(follows.followerId, target.authorId),
                    eq(follows.followingId, scheduled.authorId),
                  ),
                )
                .limit(1);
              if (!allowed) throw new Error('Replies are restricted on the target Tweet');
            }
            if (target.replyAudience === 'mentioned') {
              const [allowed] = await tx
                .select({ userId: tweetMentions.userId })
                .from(tweetMentions)
                .where(
                  and(
                    eq(tweetMentions.tweetId, targetId),
                    eq(tweetMentions.userId, scheduled.authorId),
                  ),
                )
                .limit(1);
              if (!allowed) throw new Error('Replies are restricted on the target Tweet');
            }
          }
          return target;
        };

        const replyTarget = replyTo ? await validateTarget(replyTo, true) : null;
        const quoteTarget = quoted ? await validateTarget(quoted, false) : null;
        const threadRootId = replyTo ? (replyTarget?.threadRootId ?? replyTo) : null;

        if (payload.mediaIds?.length) {
          const assets = await tx
            .select({
              id: media.id,
              ownerId: media.ownerId,
              status: media.status,
              variants: media.variants,
            })
            .from(media)
            .where(
              inArray(
                media.id,
                payload.mediaIds.map((id) => BigInt(id)),
              ),
            );
          if (
            assets.length !== payload.mediaIds.length ||
            assets.some(
              (asset) =>
                asset.ownerId !== scheduled.authorId ||
                asset.status !== 'ready' ||
                (asset.variants as Record<string, unknown> | null)?.purpose !== 'tweet',
            )
          ) {
            throw new Error('Scheduled Tweet media is no longer available');
          }
        }

        const [created] = await tx
          .insert(tweets)
          .values({
            authorId: scheduled.authorId,
            body: payload.body,
            replyToTweetId: replyTo,
            quotedTweetId: quoted,
            threadRootId,
            replyAudience: payload.replyAudience ?? 'everyone',
            isSensitive: payload.isSensitive ?? false,
            publishedAt: new Date(),
          })
          .returning({ id: tweets.id });
        if (!created) throw new Error('Scheduled Tweet insertion returned no id');

        if (payload.mediaIds?.length) {
          await tx.insert(tweetMedia).values(
            payload.mediaIds.map((mediaId, position) => ({
              tweetId: created.id,
              mediaId: BigInt(mediaId),
              position,
            })),
          );
        }
        if (payload.poll) {
          const [poll] = await tx
            .insert(polls)
            .values({
              tweetId: created.id,
              endsAt: new Date(Date.now() + payload.poll.durationMinutes * 60_000),
            })
            .returning({ id: polls.id });
          if (poll) {
            await tx.insert(pollOptions).values(
              payload.poll.options.map((label, position) => ({
                pollId: poll.id,
                label,
                position,
              })),
            );
          }
        }

        await tx
          .update(profiles)
          .set({ tweetCount: sql`${profiles.tweetCount} + 1`, updatedAt: new Date() })
          .where(eq(profiles.userId, scheduled.authorId));
        if (replyTo) {
          await tx
            .update(tweets)
            .set({ replyCount: sql`${tweets.replyCount} + 1`, lastActivityAt: new Date() })
            .where(eq(tweets.id, replyTo));
        }
        if (quoted) {
          await tx
            .update(tweets)
            .set({ quoteCount: sql`${tweets.quoteCount} + 1`, lastActivityAt: new Date() })
            .where(eq(tweets.id, quoted));
        }

        const notify = async (
          recipientId: string,
          type: 'reply' | 'quote' | 'mention',
          dedupeKey: string,
        ) => {
          if (recipientId === scheduled.authorId) return;
          const [preferences] = await tx
            .select({
              mentions: settings.notificationMentions,
              retweets: settings.notificationRetweets,
            })
            .from(settings)
            .where(eq(settings.userId, recipientId))
            .limit(1);
          const allowed =
            type === 'quote' ? (preferences?.retweets ?? true) : (preferences?.mentions ?? true);
          if (!allowed) return;
          const inserted = await tx
            .insert(notifications)
            .values({
              recipientId,
              actorId: scheduled.authorId,
              type,
              tweetId: created.id,
              dedupeKey,
            })
            .onConflictDoNothing()
            .returning({ id: notifications.id });
          if (!inserted.length) return;
          await tx.insert(outboxEvents).values({
            aggregateType: 'notification',
            aggregateId: created.id.toString(),
            eventType: 'notification.created',
            payload: {
              recipientId,
              actorId: scheduled.authorId,
              tweetId: created.id.toString(),
              type,
            },
          });
        };

        if (replyTarget) {
          await notify(replyTarget.authorId, 'reply', `reply:${created.id.toString()}`);
        }
        if (quoteTarget) {
          await notify(quoteTarget.authorId, 'quote', `quote:${created.id.toString()}`);
        }

        for (const match of payload.body.matchAll(/@([A-Za-z0-9_]{1,15})/g)) {
          const [mentioned] = await tx
            .select({ userId: profiles.userId })
            .from(profiles)
            .innerJoin(users, eq(users.id, profiles.userId))
            .where(
              and(sql`lower(${profiles.handle}) = lower(${match[1]})`, eq(users.status, 'active')),
            )
            .limit(1);
          if (!mentioned) continue;
          const [blocked] = await tx
            .select({ blockerId: blocks.blockerId })
            .from(blocks)
            .where(
              or(
                and(
                  eq(blocks.blockerId, scheduled.authorId),
                  eq(blocks.blockedId, mentioned.userId),
                ),
                and(
                  eq(blocks.blockerId, mentioned.userId),
                  eq(blocks.blockedId, scheduled.authorId),
                ),
              ),
            )
            .limit(1);
          if (blocked) continue;
          await tx
            .insert(tweetMentions)
            .values({
              tweetId: created.id,
              userId: mentioned.userId,
              start: match.index,
              end: match.index + match[0].length,
            })
            .onConflictDoNothing();
          await notify(
            mentioned.userId,
            'mention',
            `mention:${created.id.toString()}:${mentioned.userId}`,
          );
        }

        const tags = [
          ...new Set(
            [...payload.body.matchAll(/#([\p{L}\p{N}_]{1,100})/gu)].map((match) =>
              match[1]!.toLowerCase(),
            ),
          ),
        ];
        for (const tag of tags) {
          await tx.execute(sql`
            INSERT INTO hashtags (tag, use_count, last_used_at)
            VALUES (${tag}, 1, now())
            ON CONFLICT (lower(tag)) DO UPDATE
              SET use_count = hashtags.use_count + 1, last_used_at = now()
          `);
          const [hashtag] = await tx
            .select({ id: hashtags.id })
            .from(hashtags)
            .where(sql`lower(${hashtags.tag}) = ${tag}`)
            .limit(1);
          if (hashtag) {
            await tx
              .insert(tweetHashtags)
              .values({ tweetId: created.id, hashtagId: hashtag.id })
              .onConflictDoNothing();
            const topic = await tx.execute<{ id: bigint }>(sql`
              INSERT INTO topics (slug, name, description)
              VALUES (
                ${tag},
                left(initcap(replace(${tag}, '_', ' ')), 100),
                ${`Tweets about #${tag}.`}
              )
              ON CONFLICT (slug) DO UPDATE SET active = true
              RETURNING id
            `);
            const topicId = topic.rows[0]?.id;
            if (topicId) {
              await tx.execute(sql`
                INSERT INTO topic_tweets (topic_id, tweet_id, confidence)
                VALUES (${topicId}, ${created.id}, 100)
                ON CONFLICT DO NOTHING
              `);
            }
          }
        }
        await tx.insert(outboxEvents).values({
          aggregateType: 'tweet',
          aggregateId: created.id.toString(),
          eventType: 'timeline.new',
          payload: { authorId: scheduled.authorId, tweetId: created.id.toString() },
        });
        await tx
          .update(scheduledTweets)
          .set({
            status: 'published',
            publishedTweetId: created.id,
            lockedAt: null,
            lastError: null,
          })
          .where(eq(scheduledTweets.id, scheduled.id));
        return created.id;
      });
    } catch (error) {
      await db
        .update(scheduledTweets)
        .set({
          status: scheduled.attempts + 1 >= 5 ? 'failed' : 'scheduled',
          lockedAt: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown publish error',
        })
        .where(eq(scheduledTweets.id, scheduled.id));
    }
  }
  return { published: due.length };
}

async function processMedia(mediaId: string) {
  const id = BigInt(mediaId);
  const [asset] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!asset || asset.status === 'ready') return;
  const existingVariants =
    asset.variants && typeof asset.variants === 'object'
      ? (asset.variants as Record<string, unknown>)
      : {};
  const privateObject = existingVariants.purpose === 'message';
  await db
    .update(media)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(media.id, id));

  try {
    const original = await storage.get(asset.storageKey, privateObject);
    if (asset.type !== 'image' || privateObject) {
      const metadata = await sharp(original, { animated: true })
        .metadata()
        .catch(() => undefined);
      await db
        .update(media)
        .set({
          status: 'ready',
          width: metadata?.width ?? asset.width,
          height: metadata?.height ?? asset.height,
          variants: privateObject
            ? existingVariants
            : { ...existingVariants, original: `${config.s3PublicUrl}/${asset.storageKey}` },
          processingError: null,
          updatedAt: new Date(),
        })
        .where(eq(media.id, id));
      return;
    }

    const image = sharp(original).rotate();
    const metadata = await image.metadata();
    const variants: Record<string, unknown> = { ...existingVariants };
    for (const [name, width] of [
      ['small', 680],
      ['medium', 1200],
      ['large', 2048],
    ] as const) {
      const key = `variants/${mediaId}/${name}.webp`;
      const output = await image
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();
      variants[name] = { url: await storage.put(key, output, 'image/webp'), width };
    }
    await db
      .update(media)
      .set({
        status: 'ready',
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        variants,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(media.id, id));
  } catch (error) {
    await db
      .update(media)
      .set({
        status: 'failed',
        processingError:
          error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown media error',
        updatedAt: new Date(),
      })
      .where(eq(media.id, id));
    throw error;
  }
}

async function refreshTrends() {
  const result = await db.execute<{
    tag: string;
    uses: number;
    authors: number;
    latest: Date;
    score: number;
  }>(sql`
    SELECT lower(h.tag) AS tag,
           count(*)::int AS uses,
           count(DISTINCT t.author_id)::int AS authors,
           max(t.published_at) AS latest,
           (count(DISTINCT t.author_id) * 4 + count(*) * 2 +
             greatest(0, 24 - extract(epoch from (now() - max(t.published_at))) / 3600))::float AS score
      FROM tweet_hashtags th
      JOIN hashtags h ON h.id = th.hashtag_id
      JOIN tweets t ON t.id = th.tweet_id
      JOIN users u ON u.id = t.author_id AND u.status = 'active'
      LEFT JOIN user_settings us ON us.user_id = t.author_id
     WHERE t.deleted_at IS NULL
       AND COALESCE(us.protected_account, false) = false
       AND t.published_at >= now() - interval '24 hours'
     GROUP BY lower(h.tag)
    HAVING count(DISTINCT t.author_id) >= 2
     ORDER BY score DESC, latest DESC
     LIMIT 20
  `);
  const trends = result.rows.map((row) => ({
    ...row,
    latest: new Date(row.latest).toISOString(),
    score: Number(row.score),
  }));
  await redis.set('trends:global', JSON.stringify(trends), 'EX', 600);
  return { trends: trends.length };
}

async function buildArchive(exportId: string) {
  const id = BigInt(exportId);
  const [request] = await db
    .select()
    .from(archiveExports)
    .where(eq(archiveExports.id, id))
    .limit(1);
  if (!request || request.status === 'ready') return;
  await db.update(archiveExports).set({ status: 'processing' }).where(eq(archiveExports.id, id));

  try {
    const userId = request.userId;
    const [
      account,
      profile,
      userSettings,
      userTweets,
      userLikes,
      userBookmarks,
      following,
      memberships,
    ] = await Promise.all([
      db.select().from(users).where(eq(users.id, userId)),
      db.select().from(profiles).where(eq(profiles.userId, userId)),
      db.select().from(settings).where(eq(settings.userId, userId)),
      db.select().from(tweets).where(eq(tweets.authorId, userId)),
      db.select().from(likes).where(eq(likes.userId, userId)),
      db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
      db.select().from(follows).where(eq(follows.followerId, userId)),
      db.select().from(conversationMembers).where(eq(conversationMembers.userId, userId)),
    ]);
    const conversationIds = memberships.map((membership) => membership.conversationId);
    const [userConversations, userMessages] = conversationIds.length
      ? await Promise.all([
          db.select().from(conversations).where(inArray(conversations.id, conversationIds)),
          db.select().from(messages).where(inArray(messages.conversationId, conversationIds)),
        ])
      : [[], []];
    const payload = {
      generatedAt: new Date().toISOString(),
      account,
      profile,
      settings: userSettings,
      tweets: userTweets,
      likes: userLikes,
      bookmarks: userBookmarks,
      following,
      conversations: userConversations,
      messages: userMessages,
    };
    const json = JSON.stringify(serialize(payload), null, 2);
    const compressed = zipSync({ 'twitter-data.json': strToU8(json) }, { level: 6 });
    const key = `exports/${userId}/${exportId}.zip`;
    await storage.putPrivate(key, Buffer.from(compressed), 'application/zip');
    await db
      .update(archiveExports)
      .set({
        status: 'ready',
        storageKey: key,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
        lastError: null,
      })
      .where(eq(archiveExports.id, id));
  } catch (error) {
    await db
      .update(archiveExports)
      .set({
        status: 'failed',
        lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown export error',
      })
      .where(eq(archiveExports.id, id));
    throw error;
  }
}

async function cleanupExpiredData() {
  const now = new Date();
  const expired = await db
    .select({ id: archiveExports.id, storageKey: archiveExports.storageKey })
    .from(archiveExports)
    .where(and(eq(archiveExports.status, 'ready'), lte(archiveExports.expiresAt, now)));
  for (const item of expired) {
    if (item.storageKey) await storage.remove(item.storageKey, true).catch(() => undefined);
  }
  if (expired.length) {
    await db
      .update(archiveExports)
      .set({ status: 'expired', storageKey: null })
      .where(
        inArray(
          archiveExports.id,
          expired.map((item) => item.id),
        ),
      );
  }
  const deleted = await db
    .delete(users)
    .where(and(eq(users.status, 'deactivated'), lte(users.deletionScheduledAt, now)))
    .returning({ id: users.id });
  return { expiredExports: expired.length, deletedAccounts: deleted.length };
}

function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  }
  return value;
}

function isMailPayload(payload: Record<string, unknown>): payload is {
  to: string;
  subject: string;
  text: string;
  html?: string;
} {
  return (
    typeof payload.to === 'string' &&
    typeof payload.subject === 'string' &&
    typeof payload.text === 'string' &&
    (payload.html === undefined || typeof payload.html === 'string')
  );
}

function queueOptions(jobId: string) {
  return {
    jobId,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 5_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
  };
}

for (const worker of [maintenanceWorker, mediaWorker, mailWorker, archiveWorker]) {
  worker.on('failed', (job, error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'worker',
        queue: worker.name,
        jobId: job?.id,
        error: error.message,
      }),
    );
  });
}

console.log(JSON.stringify({ level: 'info', service: 'worker', status: 'ready' }));

const shutdown = async () => {
  await Promise.all([
    maintenanceWorker.close(),
    mediaWorker.close(),
    mailWorker.close(),
    archiveWorker.close(),
    maintenanceQueue.close(),
    mediaQueue.close(),
    mailQueue.close(),
    archiveQueue.close(),
  ]);
  await Promise.all([redis.quit(), closeDb()]);
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
