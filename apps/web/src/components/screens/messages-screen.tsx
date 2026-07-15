/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, EmptyState, ErrorState } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { Avatar, Modal, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { useApi, apiFetch } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { useSession, useToast } from '@/components/providers/app-providers';
import '@/styles/messages.css';

type Message = {
  id: string;
  text: string;
  createdAt: string;
  senderId: string;
  sender?: User | undefined;
  readAt?: string | null | undefined;
  media: MessageMedia[];
};
type MessageMedia = {
  id: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  previewUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
};

const COMMON_EMOJIS = ['😀', '😂', '😍', '🥰', '😢', '😮', '👍', '👏', '❤️', '🔥', '🎉', '✨'];

function emitRealtime(name: string, payload: Record<string, string>) {
  window.dispatchEvent(
    new CustomEvent('twitter:realtime-emit', {
      detail: { name, payload },
    }),
  );
}
type LocalAttachment = { file: File; previewUrl: string; mediaId?: string };
type Conversation = {
  id: string;
  participants: User[];
  lastMessage?: Message | null;
  updatedAt?: string;
  unreadCount: number;
};

function record(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function safeMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'blob:'
      ? url.href
      : '';
  } catch {
    return '';
  }
}
function normalizeMessageMedia(value: unknown): MessageMedia | null {
  const source = record(value);
  const type = source.type;
  const processingStatus = source.processingStatus;
  const url = safeMediaUrl(source.url);
  if ((type !== 'image' && type !== 'gif' && type !== 'video') || !url) return null;
  return {
    id: String(source.id || ''),
    type,
    url,
    previewUrl: safeMediaUrl(source.previewUrl) || null,
    altText: typeof source.altText === 'string' ? source.altText : null,
    width: typeof source.width === 'number' ? source.width : null,
    height: typeof source.height === 'number' ? source.height : null,
    processingStatus:
      processingStatus === 'pending' ||
      processingStatus === 'processing' ||
      processingStatus === 'failed'
        ? processingStatus
        : 'ready',
  };
}
function normalizeMessage(value: unknown): Message {
  const source = record(value);
  return {
    id: String(source.id || ''),
    text: String(source.text || source.content || ''),
    createdAt: String(source.createdAt || ''),
    senderId: String(source.senderId || record(source.sender).id || ''),
    sender: source.sender ? normalizeUser(source.sender) : undefined,
    readAt:
      typeof source.readAt === 'string'
        ? source.readAt
        : Array.isArray(source.readBy) && source.readBy.length
          ? 'read'
          : null,
    media: Array.isArray(source.media)
      ? source.media.flatMap((item) => {
          const media = normalizeMessageMedia(item);
          return media ? [media] : [];
        })
      : [],
  };
}
function normalizeConversation(value: unknown): Conversation {
  const source = record(value);
  const participants = Array.isArray(source.participants)
    ? source.participants.map(normalizeUser)
    : [];
  return {
    id: String(source.id || ''),
    participants,
    lastMessage: source.lastMessage ? normalizeMessage(source.lastMessage) : null,
    updatedAt: String(source.updatedAt || ''),
    unreadCount: Number(source.unreadCount) || 0,
  };
}
function listFrom(value: unknown) {
  const source = record(value);
  return Array.isArray(value) ? value : Array.isArray(source.items) ? source.items : [];
}

export function MessagesScreen({ conversationId }: { conversationId?: string }) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/conversations');
  const conversations = useMemo(() => listFrom(data).map(normalizeConversation), [data]);
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter(
      (conversation) =>
        conversation.participants.some(
          (person) =>
            person.name.toLowerCase().includes(query) ||
            person.handle.toLowerCase().includes(query),
        ) || conversation.lastMessage?.text.toLowerCase().includes(query),
    );
  }, [conversations, search]);
  useEffect(() => {
    const update = () => reload();
    window.addEventListener('twitter:dm-new', update);
    window.addEventListener('twitter:dm-read', update);
    return () => {
      window.removeEventListener('twitter:dm-new', update);
      window.removeEventListener('twitter:dm-read', update);
    };
  }, [reload]);

  return (
    <AppShell hideRightSidebar wide>
      <div className={`messages-layout ${conversationId ? 'conversation-selected' : ''}`}>
        <section className="conversation-list-panel" aria-label="Messages">
          <div className="messages-header">
            <h1>Messages</h1>
            <div>
              <Link className="icon-button" href="/settings/messages" aria-label="Message settings">
                <Icon name="settings" size={21} />
              </Link>
              <button
                className="icon-button"
                onClick={() => setComposeOpen(true)}
                aria-label="New message"
              >
                <Icon name="mail" size={21} />
              </button>
            </div>
          </div>
          <div className="message-search">
            <Icon name="search" size={20} />
            <input
              aria-label="Search Direct Messages"
              placeholder="Search for people and groups"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {loading && (
            <div className="messages-loading">
              <Spinner />
            </div>
          )}
          {error && <ErrorState message={error} retry={reload} />}
          {!loading && !error && conversations.length === 0 && (
            <EmptyState
              icon="mail"
              title="Send a message, get a message"
              body="Direct Messages are private conversations between you and other people on Twitter."
              action={
                <button className="button button-primary" onClick={() => setComposeOpen(true)}>
                  Start a conversation
                </button>
              }
            />
          )}
          {!loading && !error && conversations.length > 0 && visibleConversations.length === 0 && (
            <EmptyState
              icon="search"
              title="No conversations found"
              body="Try searching for another person or message."
            />
          )}
          {visibleConversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === conversationId}
            />
          ))}
        </section>
        <section className="message-detail-panel" aria-label="Conversation">
          {conversationId ? (
            <ConversationDetail id={conversationId} />
          ) : (
            <EmptyState
              icon="mail"
              title="You don’t have a message selected"
              body="Choose one from your existing messages, or start a new one."
              action={
                <button className="button button-primary" onClick={() => setComposeOpen(true)}>
                  New message
                </button>
              }
            />
          )}
        </section>
      </div>
      <NewMessageModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </AppShell>
  );
}

function ConversationRow({
  conversation,
  selected,
}: {
  conversation: Conversation;
  selected: boolean;
}) {
  const { viewer } = useSession();
  const others = conversation.participants.filter((person) => person.id !== viewer?.id);
  const lead = others[0] || conversation.participants[0];
  const title = others.map((person) => person.name).join(', ') || 'Conversation';
  const lastMessagePreview = conversation.lastMessage?.text
    ? conversation.lastMessage.text
    : conversation.lastMessage?.media[0]?.type === 'gif'
      ? 'Sent a GIF'
      : conversation.lastMessage?.media[0]?.type === 'video'
        ? 'Sent a video'
        : conversation.lastMessage?.media.length
          ? 'Sent a photo'
          : 'No messages yet';
  return (
    <Link
      href={`/messages/${conversation.id}`}
      className={`conversation-row ${selected ? 'selected' : ''}`}
    >
      <Avatar user={lead} size={48} />
      <span className="conversation-copy">
        <span>
          <strong>{title}</strong>
          {lead?.verified && <VerifiedBadge />}
          <small>{lead?.handle ? ` @${lead.handle}` : ''}</small>
          {conversation.updatedAt && (
            <time>
              {new Date(conversation.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </time>
          )}
        </span>
        <span className={conversation.unreadCount ? 'unread-copy' : ''}>{lastMessagePreview}</span>
      </span>
      {conversation.unreadCount > 0 && (
        <b className="unread-dot">
          <span className="sr-only">{conversation.unreadCount} unread</span>
        </b>
      )}
    </Link>
  );
}

function ConversationDetail({ id }: { id: string }) {
  const { viewer } = useSession();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<LocalAttachment | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const optimisticSequence = useRef(0);
  const typingActive = useRef(false);
  const typingStopTimer = useRef<number | undefined>(undefined);
  const remoteTypingTimer = useRef<number | undefined>(undefined);
  const attachmentUrls = useRef(new Set<string>());
  const {
    data: conversationData,
    loading: conversationLoading,
    error: conversationError,
  } = useApi<unknown>(`/api/v1/conversations/${id}`);
  const {
    data: messagesData,
    loading,
    error,
    reload,
  } = useApi<unknown>(`/api/v1/conversations/${id}/messages`);
  const conversation = conversationData ? normalizeConversation(conversationData) : null;
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const serverMessages = useMemo(
    () => listFrom(messagesData).map(normalizeMessage),
    [messagesData],
  );
  const messages = useMemo(() => {
    const serverIds = new Set(serverMessages.map((message) => message.id));
    return [...serverMessages, ...optimistic.filter((message) => !serverIds.has(message.id))];
  }, [serverMessages, optimistic]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastReadRequest = useRef<string | null>(null);
  const other =
    conversation?.participants.find((person) => person.id !== viewer?.id) ||
    conversation?.participants[0];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);
  useEffect(() => {
    const latest = serverMessages.at(-1);
    const hasIncoming = serverMessages.some((message) => message.senderId !== viewer?.id);
    if (!viewer?.id || !latest || !hasIncoming || lastReadRequest.current === latest.id) return;
    lastReadRequest.current = latest.id;
    void apiFetch(`/api/v1/conversations/${id}/read`, { method: 'POST' })
      .then(() => {
        window.dispatchEvent(
          new CustomEvent('twitter:dm-read', {
            detail: { conversationId: id, messageId: latest.id, local: true },
          }),
        );
      })
      .catch(() => {
        lastReadRequest.current = null;
      });
  }, [id, serverMessages, viewer?.id]);
  useEffect(() => {
    const urls = attachmentUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  useEffect(() => {
    const belongsHere = (event: Event) => {
      const detail = event instanceof CustomEvent ? record(event.detail) : {};
      return !detail.conversationId || String(detail.conversationId) === id;
    };
    const newMessage = (event: Event) => {
      if (belongsHere(event)) reload();
    };
    const readReceipt = (event: Event) => {
      const detail = event instanceof CustomEvent ? record(event.detail) : {};
      if (!detail.local && belongsHere(event)) reload();
    };
    window.addEventListener('twitter:dm-new', newMessage);
    window.addEventListener('twitter:dm-read', readReceipt);
    return () => {
      window.removeEventListener('twitter:dm-new', newMessage);
      window.removeEventListener('twitter:dm-read', readReceipt);
    };
  }, [id, reload]);
  useEffect(() => {
    const matchesConversation = (event: Event) => {
      const detail = event instanceof CustomEvent ? record(event.detail) : {};
      return String(detail.conversationId || '') === id && detail.userId !== viewer?.id;
    };
    const started = (event: Event) => {
      if (!matchesConversation(event)) return;
      setOtherTyping(true);
      if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current);
      remoteTypingTimer.current = window.setTimeout(() => setOtherTyping(false), 4_000);
    };
    const stopped = (event: Event) => {
      if (!matchesConversation(event)) return;
      if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current);
      setOtherTyping(false);
    };
    window.addEventListener('twitter:typing-started', started);
    window.addEventListener('twitter:typing-stopped', stopped);
    return () => {
      window.removeEventListener('twitter:typing-started', started);
      window.removeEventListener('twitter:typing-stopped', stopped);
      if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current);
    };
  }, [id, viewer?.id]);
  useEffect(
    () => () => {
      if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
      if (typingActive.current) emitRealtime('typing.stopped', { conversationId: id });
    },
    [id],
  );

  const stopTyping = () => {
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
    typingStopTimer.current = undefined;
    if (!typingActive.current) return;
    typingActive.current = false;
    emitRealtime('typing.stopped', { conversationId: id });
  };

  const signalTyping = (hasText: boolean) => {
    if (!hasText) {
      stopTyping();
      return;
    }
    if (!typingActive.current) {
      typingActive.current = true;
      emitRealtime('typing.started', { conversationId: id });
    }
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
    typingStopTimer.current = window.setTimeout(stopTyping, 1_500);
  };

  const addEmoji = (emoji: string) => {
    setText((current) => `${current}${emoji}`);
    signalTyping(true);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => textInput.current?.focus());
  };

  const chooseAttachment = (file: File | undefined, gifOnly = false) => {
    if (!file) return;
    const supportedPhoto = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const supported = gifOnly ? file.type === 'image/gif' : supportedPhoto;
    if (!supported) {
      showToast(gifOnly ? 'Choose a GIF file.' : 'Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('Images and GIFs must be 15 MB or smaller.');
      return;
    }
    if (attachment) revokeAttachmentUrl(attachment.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    attachmentUrls.current.add(previewUrl);
    setAttachment({ file, previewUrl });
  };

  const revokeAttachmentUrl = (url: string) => {
    URL.revokeObjectURL(url);
    attachmentUrls.current.delete(url);
  };

  const removeAttachment = () => {
    if (attachment) revokeAttachmentUrl(attachment.previewUrl);
    setAttachment(null);
    if (photoInput.current) photoInput.current.value = '';
    if (gifInput.current) gifInput.current.value = '';
  };

  const uploadAttachment = async (file: File): Promise<string> => {
    const signed = await apiFetch<{
      mediaId: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>('/api/v1/media/presign', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        purpose: 'message',
      }),
    });
    const uploaded = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: signed.headers,
      body: file,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!uploaded.ok) throw new Error('The attachment upload didn’t finish. Please try again.');
    const finalized = await apiFetch<{ id?: string; mediaId?: string }>('/api/v1/media/finalize', {
      method: 'POST',
      body: JSON.stringify({ mediaId: signed.mediaId }),
    });
    const mediaId = finalized.mediaId || finalized.id || signed.mediaId;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await apiFetch<{
        processingStatus?: string;
        status?: string;
      }>(`/api/v1/media/${mediaId}`);
      const state = status.processingStatus || status.status;
      if (state === 'ready') return mediaId;
      if (state === 'failed') throw new Error('Twitter couldn’t process that attachment.');
      if (attempt < 29) await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
    throw new Error('The attachment is still processing. Please try again.');
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    const selectedAttachment = attachment;
    if ((!value && !selectedAttachment) || sending) return;
    stopTyping();
    setEmojiOpen(false);
    optimisticSequence.current += 1;
    const optimisticId = `${viewer?.id || 'message'}-${optimisticSequence.current}`;
    const temporary: Message = {
      id: `pending-${optimisticId}`,
      text: value,
      createdAt: new Date().toISOString(),
      senderId: viewer?.id || '',
      media: selectedAttachment
        ? [
            {
              id: `pending-media-${optimisticId}`,
              type: selectedAttachment.file.type === 'image/gif' ? 'gif' : 'image',
              url: selectedAttachment.previewUrl,
              previewUrl: selectedAttachment.previewUrl,
              altText: null,
              width: null,
              height: null,
              processingStatus: 'processing',
            },
          ]
        : [],
    };
    setOptimistic((current) => [...current, temporary]);
    setText('');
    setAttachment(null);
    setSending(true);
    let mediaId = selectedAttachment?.mediaId;
    try {
      if (selectedAttachment && !mediaId) mediaId = await uploadAttachment(selectedAttachment.file);
      const created = await apiFetch<unknown>(`/api/v1/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: value, ...(mediaId ? { mediaId } : {}) }),
      });
      const finalMessage = normalizeMessage(created);
      setOptimistic((current) => [
        ...current.filter((item) => item.id !== temporary.id),
        finalMessage,
      ]);
      reload();
      if (selectedAttachment) revokeAttachmentUrl(selectedAttachment.previewUrl);
      if (photoInput.current) photoInput.current.value = '';
      if (gifInput.current) gifInput.current.value = '';
    } catch (reason) {
      setOptimistic((current) => current.filter((item) => item.id !== temporary.id));
      setText(value);
      setAttachment(
        selectedAttachment && mediaId ? { ...selectedAttachment, mediaId } : selectedAttachment,
      );
      showToast(reason instanceof Error ? reason.message : 'Your message wasn’t sent.');
    } finally {
      setSending(false);
    }
  };

  if (conversationLoading)
    return (
      <div className="messages-loading">
        <Spinner />
      </div>
    );
  if (conversationError) return <ErrorState message={conversationError} />;
  return (
    <div className="conversation-detail">
      <header className="conversation-header">
        <Link className="icon-button mobile-conversation-back" href="/messages" aria-label="Back">
          <Icon name="back" />
        </Link>
        <Avatar user={other} size={32} />
        <span>
          <strong>{other?.name || 'Conversation'}</strong>
          {other?.verified && <VerifiedBadge />}
          <small>{other?.handle ? `@${other.handle}` : ''}</small>
        </span>
        <Link
          className="icon-button"
          href={other?.handle ? `/${other.handle}` : '/messages'}
          aria-label="Conversation information"
        >
          <Icon name="user" size={21} />
        </Link>
      </header>
      <div className="message-thread">
        {other && (
          <div className="conversation-intro">
            <Avatar user={other} size={64} />
            <strong>
              {other.name}
              {other.verified && <VerifiedBadge />}
            </strong>
            <span>@{other.handle}</span>
            {other.bio && <p>{other.bio}</p>}
            <small>You’re starting a new conversation</small>
          </div>
        )}
        {loading && <Spinner />}
        {error && <ErrorState message={error} retry={reload} />}
        {messages.map((message, index) => {
          const mine = message.senderId === viewer?.id;
          const showTime =
            index === messages.length - 1 || messages[index + 1]?.senderId !== message.senderId;
          return (
            <div className={`message-bubble-wrap ${mine ? 'mine' : 'theirs'}`} key={message.id}>
              <div
                className={`message-bubble ${message.media.length ? 'with-media' : ''} ${
                  message.id.startsWith('pending-') ? 'pending' : ''
                }`}
              >
                {message.media.map((media) => (
                  <MessageMediaView key={media.id} media={media} />
                ))}
                {message.text && <span className="message-text">{message.text}</span>}
              </div>
              {showTime && (
                <time>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {mine && message.readAt ? ' · Seen' : ''}
                </time>
              )}
            </div>
          );
        })}
        {otherTyping && (
          <div
            className="message-typing"
            role="status"
            aria-label={`${other?.name || 'Someone'} is typing`}
          >
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form className="message-composer" onSubmit={send}>
        <input
          ref={photoInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            chooseAttachment(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={gifInput}
          className="sr-only"
          type="file"
          accept="image/gif"
          onChange={(event) => {
            chooseAttachment(event.target.files?.[0], true);
            event.currentTarget.value = '';
          }}
        />
        {attachment && (
          <div className="message-attachment-preview">
            <img src={attachment.previewUrl} alt="Attachment preview" />
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={removeAttachment}
              disabled={sending}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {emojiOpen && (
          <div
            className="message-emoji-picker"
            id="message-emoji-picker"
            role="dialog"
            aria-label="Choose an emoji"
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => addEmoji(emoji)}
                aria-label={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label="Add photo"
          onClick={() => photoInput.current?.click()}
          disabled={sending}
        >
          <Icon name="image" size={21} />
        </button>
        <button
          type="button"
          aria-label="Add GIF"
          onClick={() => gifInput.current?.click()}
          disabled={sending}
        >
          <Icon name="gif" size={21} />
        </button>
        <label>
          <span className="sr-only">Start a new message</span>
          <textarea
            ref={textInput}
            rows={1}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              signalTyping(Boolean(event.target.value.trim()));
            }}
            placeholder="Start a new message"
            disabled={sending}
          />
        </label>
        <button
          type="button"
          aria-label="Add emoji"
          aria-expanded={emojiOpen}
          aria-controls="message-emoji-picker"
          onClick={() => setEmojiOpen((open) => !open)}
        >
          <Icon name="emoji" size={21} />
        </button>
        <button
          type="submit"
          disabled={(!text.trim() && !attachment) || sending}
          aria-label={sending ? 'Sending' : 'Send'}
        >
          {sending ? <Spinner /> : <Icon name="feather" size={21} />}
        </button>
      </form>
    </div>
  );
}

function MessageMediaView({ media }: { media: MessageMedia }) {
  if (media.type === 'video') {
    return (
      <video
        className="message-media"
        src={media.url}
        poster={media.previewUrl || undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={media.altText || 'Video attachment'}
      />
    );
  }
  return (
    <img
      className="message-media"
      src={media.url}
      alt={media.altText || (media.type === 'gif' ? 'GIF attachment' : 'Image attachment')}
      width={media.width || undefined}
      height={media.height || undefined}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function NewMessageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const { data, loading } = useApi<unknown>(
    query.trim().length >= 2
      ? `/api/v1/search?q=${encodeURIComponent(query.trim())}&type=people`
      : null,
  );
  const users = useMemo(
    () =>
      listFrom(data).map((item) => {
        const source = record(item);
        return normalizeUser(source.user || item);
      }),
    [data],
  );
  const start = async () => {
    if (!selected.length) return;
    const created = await apiFetch<unknown>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ participantIds: selected.map((user) => user.id) }),
    });
    const conversation = normalizeConversation(created);
    onClose();
    router.push(`/messages/${conversation.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="New message" className="new-message-modal">
      <div className="new-message-header">
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <h2>New message</h2>
        <button
          className="button button-primary"
          disabled={!selected.length}
          onClick={() => void start()}
        >
          Next
        </button>
      </div>
      <div className="new-message-search">
        <Icon name="search" size={20} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
        />
      </div>
      {selected.length > 0 && (
        <div className="selected-people">
          {selected.map((user) => (
            <button
              key={user.id}
              onClick={() =>
                setSelected((current) => current.filter((item) => item.id !== user.id))
              }
            >
              <Avatar user={user} size={24} />
              {user.name}
              <Icon name="close" size={15} />
            </button>
          ))}
        </div>
      )}
      <div className="people-results">
        {loading && <Spinner />}
        {query.length < 2 && <p>Try searching for people by name or username.</p>}
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() =>
              setSelected((current) =>
                current.some((item) => item.id === user.id)
                  ? current.filter((item) => item.id !== user.id)
                  : [...current, user],
              )
            }
          >
            <Avatar user={user} size={40} />
            <span>
              <strong>{user.name}</strong>
              <small>@{user.handle}</small>
            </span>
            {selected.some((item) => item.id === user.id) && <Icon name="check" size={20} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
