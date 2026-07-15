import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  closeDb,
  conversationMembers,
  db,
  messageReads,
  messages,
  settings,
} from '@twitter2020/db';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import Redis from 'ioredis';
import { Server } from 'socket.io';

type RealtimeToken = {
  userId: string;
  expiresAt: number;
};

const port = Number(process.env.REALTIME_PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const secret = process.env.REALTIME_SHARED_SECRET;

if (!secret || secret.length < 32) {
  throw new Error('REALTIME_SHARED_SECRET must contain at least 32 characters');
}
const realtimeSecret: string = secret;

function decodeToken(rawToken: unknown): RealtimeToken | null {
  if (typeof rawToken !== 'string') return null;
  const [encodedUserId, encodedExpiry, signature] = rawToken.split('.');
  if (!encodedUserId || !encodedExpiry || !signature) return null;

  const expected = createHmac('sha256', realtimeSecret)
    .update(`${encodedUserId}.${encodedExpiry}`)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const expiresAt = Number(encodedExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

  try {
    const userId = Buffer.from(encodedUserId, 'base64url').toString('utf8');
    return userId ? { userId, expiresAt } : null;
  } catch {
    return null;
  }
}

const httpServer = createServer((request, response) => {
  if (request.url === '/health/live' || request.url === '/health/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'realtime' }));
    return;
  }
  response.writeHead(404).end();
});

const io = new Server(httpServer, {
  cors: { origin: appUrl, credentials: true },
  transports: ['websocket', 'polling'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
const subscriber = publisher.duplicate();
io.adapter(createAdapter(publisher, subscriber));

io.use((socket, next) => {
  const decoded = decodeToken(socket.handshake.auth.token);
  if (!decoded) return next(new Error('unauthorized'));
  socket.data.userId = decoded.userId;
  socket.data.tokenExpiresAt = decoded.expiresAt;
  next();
});

io.on('connection', (socket) => {
  const userId = String(socket.data.userId);
  const hasValidToken = () => {
    const valid = Math.floor(Date.now() / 1000) < Number(socket.data.tokenExpiresAt);
    if (!valid) socket.disconnect(true);
    return valid;
  };
  const expiresInMs = Math.max(0, Number(socket.data.tokenExpiresAt) * 1_000 - Date.now());
  const expiryTimer = setTimeout(() => socket.disconnect(true), expiresInMs);
  socket.once('disconnect', () => clearTimeout(expiryTimer));
  void socket.join(`user:${userId}`);
  socket.emit('connection.ready', { connectedAt: new Date().toISOString() });

  socket.on('notification.read', (payload: { notificationId?: string }) => {
    if (!hasValidToken() || !payload?.notificationId) return;
    void publisher.publish(
      'domain-events',
      JSON.stringify({
        type: 'notification.read',
        actorId: userId,
        notificationId: payload.notificationId,
        occurredAt: new Date().toISOString(),
      }),
    );
  });

  const sendTyping = async (
    event: 'typing.started' | 'typing.stopped',
    conversationId?: string,
  ) => {
    if (!conversationId || !hasValidToken()) return;
    let id: bigint;
    try {
      id = BigInt(conversationId);
    } catch {
      return;
    }
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), isNull(conversationMembers.leftAt)));
    if (!members.some((member) => member.userId === userId)) return;
    for (const member of members) {
      if (member.userId !== userId) {
        io.to(`user:${member.userId}`).emit(event, { conversationId, userId });
      }
    }
  };

  socket.on('typing.started', (payload: { conversationId?: string }) => {
    void sendTyping('typing.started', payload?.conversationId).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'realtime',
          event: 'typing.started',
          error: String(error),
        }),
      );
    });
  });
  socket.on('typing.stopped', (payload: { conversationId?: string }) => {
    void sendTyping('typing.stopped', payload?.conversationId).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'realtime',
          event: 'typing.stopped',
          error: String(error),
        }),
      );
    });
  });

  const markDirectMessageRead = async (payload: {
    conversationId?: string;
    messageId?: string;
  }) => {
    if (!hasValidToken() || !payload?.conversationId || !payload.messageId) return;
    let conversationId: bigint;
    let messageId: bigint;
    try {
      conversationId = BigInt(payload.conversationId);
      messageId = BigInt(payload.messageId);
    } catch {
      return;
    }
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          isNull(conversationMembers.leftAt),
        ),
      );
    if (!members.some((member) => member.userId === userId)) return;
    const [message] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1);
    if (!message) return;
    const [preference] = await db
      .select({ showReadReceipts: settings.showReadReceipts })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    const showReadReceipts = preference?.showReadReceipts ?? true;
    if (showReadReceipts) {
      await db.insert(messageReads).values({ messageId, userId }).onConflictDoNothing();
    }
    await db
      .update(conversationMembers)
      .set({ lastReadMessageId: messageId })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
          or(
            isNull(conversationMembers.lastReadMessageId),
            lt(conversationMembers.lastReadMessageId, messageId),
          ),
        ),
      );
    if (!showReadReceipts) return;
    for (const member of members) {
      if (member.userId !== userId) {
        io.to(`user:${member.userId}`).emit('dm.read', {
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          userId,
        });
      }
    }
  };

  socket.on('dm.read', (payload: { conversationId?: string; messageId?: string }) => {
    void markDirectMessageRead(payload).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'realtime',
          event: 'dm.read',
          error: String(error),
        }),
      );
    });
  });
});

const domainSubscriber = publisher.duplicate();
await domainSubscriber.psubscribe('realtime:user:*');
domainSubscriber.on('pmessage', (_pattern, channel, rawPayload) => {
  const userId = channel.slice('realtime:user:'.length);
  try {
    const event = JSON.parse(rawPayload) as { type?: string; payload?: unknown };
    if (event.type) io.to(`user:${userId}`).emit(event.type, event.payload);
  } catch {
    // Invalid messages are ignored so one producer cannot terminate the gateway.
  }
});

const shutdown = async () => {
  io.close();
  await Promise.all([publisher.quit(), subscriber.quit(), domainSubscriber.quit(), closeDb()]);
  httpServer.close(() => process.exit(0));
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

httpServer.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', service: 'realtime', port }));
});
