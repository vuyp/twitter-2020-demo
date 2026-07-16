/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Avatar, Modal, Spinner } from '@/components/ui/primitives';
import { useSession, useToast } from '@/components/providers/app-providers';
import { apiFetch } from '@/hooks/use-api';
import { normalizeTweet, type Tweet } from '@/components/types';
import { weightedTweetLength } from '@twitter2020/contracts';

type LocalMedia = { file: File; preview: string; altText: string };
type PollDraft = { options: string[]; days: number; hours: number; minutes: number };

const TWEET_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TweetComposer({
  autoFocus = false,
  modal = false,
  replyTo,
  quoteTweet,
  onCreated,
}: {
  autoFocus?: boolean;
  modal?: boolean;
  replyTo?: Tweet;
  quoteTweet?: Tweet;
  onCreated?: (tweet: Tweet) => void;
}) {
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audience, setAudience] = useState<'everyone' | 'following' | 'mentioned'>('everyone');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const gifFileInput = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<LocalMedia[]>([]);
  const count = weightedTweetLength(text);
  const remaining = 280 - count;
  const pollOptions = poll?.options.map((option) => option.trim()).filter(Boolean) ?? [];
  const pollDuration = poll ? poll.days * 1440 + poll.hours * 60 + poll.minutes : 0;
  const pollValid = !poll || (pollOptions.length >= 2 && pollDuration >= 5);

  const canPost =
    (text.trim().length > 0 || media.length > 0 || pollOptions.length >= 2) &&
    pollValid &&
    remaining >= 0 &&
    !submitting &&
    !savingDraft;

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(
    () => () => {
      mediaRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    },
    [],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const selected = [...files];
    if (selected.some((file) => !TWEET_MEDIA_TYPES.has(file.type))) {
      setError('Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.');
      return;
    }
    if (selected.some((file) => file.size === 0)) {
      setError('That media file is empty. Choose a different file.');
      return;
    }
    const oversized = selected.find(
      (file) => file.size > (file.type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES),
    );
    if (oversized) {
      setError(
        oversized.type.startsWith('video/')
          ? 'Videos must be 512 MB or smaller.'
          : 'Images and GIFs must be 15 MB or smaller.',
      );
      return;
    }
    const exclusive = selected.find(
      (file) => file.type.startsWith('video/') || file.type === 'image/gif',
    );
    if (exclusive) {
      if (media.length || selected.length > 1) {
        setError('Choose either one GIF or video, or up to four photos.');
        return;
      }
      setError(null);
      setMedia([{ file: exclusive, preview: URL.createObjectURL(exclusive), altText: '' }]);
      return;
    }
    if (
      media.some((item) => item.file.type.startsWith('video/') || item.file.type === 'image/gif')
    ) {
      setError('Photos can’t be added with a GIF or video.');
      return;
    }
    const slots = Math.max(0, 4 - media.length);
    const photos = selected.filter((file) => file.type !== 'image/gif');
    if (photos.length > slots) {
      setError('Choose up to four photos.');
      return;
    }
    setError(null);
    setMedia((current) => [
      ...current,
      ...photos.map((file) => ({ file, preview: URL.createObjectURL(file), altText: '' })),
    ]);
  };

  const chooseGif = async (gif: GifResult) => {
    if (!viewer) {
      router.push('/login');
      return;
    }
    setError(null);
    try {
      const response = await fetch(gif.url);
      if (!response.ok) throw new Error('That GIF could not be downloaded.');
      const blob = await response.blob();
      const file = new File([blob], `giphy-${gif.id}.gif`, { type: 'image/gif' });
      if (file.size > 15 * 1024 * 1024) throw new Error('That GIF is too large to upload.');
      media.forEach((item) => URL.revokeObjectURL(item.preview));
      setMedia([{ file, preview: URL.createObjectURL(file), altText: gif.title }]);
      setPoll(null);
      setGifOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That GIF could not be added.');
    }
  };

  const uploadMedia = async () => {
    const ids: string[] = [];
    for (const item of media) {
      const signed = await apiFetch<{
        id?: string;
        mediaId?: string;
        uploadUrl: string;
        headers?: Record<string, string>;
      }>('/api/v1/media/presign', {
        method: 'POST',
        body: JSON.stringify({
          fileName: item.file.name,
          contentType: item.file.type,
          sizeBytes: item.file.size,
          purpose: 'tweet',
        }),
      });
      const upload = await fetch(signed.uploadUrl, {
        method: 'PUT',
        ...(signed.headers ? { headers: signed.headers } : {}),
        body: item.file,
      });
      if (!upload.ok) throw new Error('The media upload didn’t finish. Please try again.');
      const mediaId = signed.mediaId || signed.id || '';
      const finalized = await apiFetch<{ id?: string; mediaId?: string }>(
        '/api/v1/media/finalize',
        {
          method: 'POST',
          body: JSON.stringify({ mediaId, altText: item.altText || undefined }),
        },
      );
      const finalId = finalized.mediaId || finalized.id || mediaId;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await apiFetch<{
          status?: string;
          processingStatus?: string;
          error?: string;
        }>(`/api/v1/media/${finalId}`);
        const state = status.status || status.processingStatus;
        if (state === 'ready') break;
        if (state === 'failed')
          throw new Error(status.error || 'This media file couldn’t be processed.');
        if (attempt === 19)
          throw new Error('Media processing is taking too long. Please try again.');
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      ids.push(finalId);
    }
    return ids.filter(Boolean);
  };

  const submit = async (asDraft = false) => {
    if (!canPost) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    if (asDraft) setSavingDraft(true);
    else setSubmitting(true);
    setError(null);
    try {
      const mediaIds = await uploadMedia();
      const created = await apiFetch<unknown>(
        replyTo ? `/api/v1/tweets/${replyTo.id}/replies` : '/api/v1/tweets',
        {
          method: 'POST',
          body: JSON.stringify({
            text: text.trim(),
            ...(mediaIds.length ? { mediaIds } : {}),
            ...(replyTo ? { replyToId: replyTo.id } : {}),
            ...(quoteTweet ? { quoteTweetId: quoteTweet.id } : {}),
            ...(poll ? { poll: { options: pollOptions, durationMinutes: pollDuration } } : {}),
            ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
            ...(asDraft ? { draft: true } : {}),
            replyAudience: audience,
          }),
        },
      );
      const createdRecord =
        created && typeof created === 'object' ? (created as Record<string, unknown>) : {};
      setText('');
      media.forEach((item) => URL.revokeObjectURL(item.preview));
      setMedia([]);
      setPoll(null);
      setScheduledAt('');
      if (
        !asDraft &&
        !scheduledAt &&
        createdRecord.id &&
        (createdRecord.author || createdRecord.user)
      )
        onCreated?.(normalizeTweet(created));
      showToast(
        asDraft
          ? 'Your draft was saved.'
          : scheduledAt
            ? 'Your Tweet was scheduled.'
            : 'Your Tweet was sent.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your Tweet couldn’t be sent.');
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  };

  const audienceLabel =
    audience === 'everyone'
      ? 'Everyone'
      : audience === 'following'
        ? 'People you follow'
        : 'Only people you mention';

  return (
    <section
      className={`tweet-composer ${modal ? 'tweet-composer-modal' : ''}`}
      aria-label={replyTo ? 'Tweet your reply' : 'Compose a Tweet'}
    >
      <Avatar user={viewer} size={48} />
      <div className="composer-body">
        {replyTo && (
          <div className="replying-to">
            Replying to <span>@{replyTo.author.handle}</span>
          </div>
        )}
        <label className="sr-only" htmlFor={`tweet-text-${replyTo?.id || 'new'}`}>
          {replyTo ? 'Tweet your reply' : 'What’s happening?'}
        </label>
        <textarea
          id={`tweet-text-${replyTo?.id || 'new'}`}
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={replyTo ? 'Tweet your reply' : 'What’s happening?'}
          rows={modal ? 4 : 2}
        />
        {quoteTweet && (
          <div className="composer-quote">
            <strong>{quoteTweet.author.name}</strong>
            <span>@{quoteTweet.author.handle}</span>
            <p>{quoteTweet.text}</p>
          </div>
        )}
        {media.length > 0 && (
          <div className={`composer-media composer-media-${media.length}`}>
            {media.map((item, index) => (
              <div key={item.preview} className="composer-media-item">
                <img src={item.preview} alt="Preview" />
                <button
                  className="media-remove"
                  onClick={() =>
                    setMedia((current) => {
                      const removed = current[index];
                      if (removed) URL.revokeObjectURL(removed.preview);
                      return current.filter((_, itemIndex) => itemIndex !== index);
                    })
                  }
                  aria-label="Remove media"
                >
                  <Icon name="close" size={18} />
                </button>
                <button
                  className="media-alt"
                  onClick={() => {
                    const altText = window.prompt(
                      'Describe this image for people with visual impairments',
                      item.altText,
                    );
                    if (altText !== null)
                      setMedia((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index ? { ...value, altText } : value,
                        ),
                      );
                  }}
                >
                  {item.altText ? 'Edit description' : '+ ALT'}
                </button>
              </div>
            ))}
          </div>
        )}
        {poll && <PollEditor value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />}
        {scheduledAt && (
          <div className="scheduled-note">
            <Icon name="calendar" size={17} /> Will send on {new Date(scheduledAt).toLocaleString()}{' '}
            <button onClick={() => setScheduledAt('')} aria-label="Remove schedule">
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {error && (
          <div className="composer-error" role="alert">
            {error}
          </div>
        )}
        {!replyTo && (
          <div className="reply-permission-wrap">
            <button
              type="button"
              className="reply-permission"
              onClick={() => setAudienceOpen((value) => !value)}
              aria-expanded={audienceOpen}
            >
              <Icon name={audience === 'everyone' ? 'globe' : 'people'} size={16} />
              <span>{audienceLabel} can reply</span>
            </button>
            {audienceOpen && (
              <AudienceMenu
                value={audience}
                onChange={(value) => {
                  setAudience(value);
                  setAudienceOpen(false);
                }}
              />
            )}
          </div>
        )}
        <div className="composer-toolbar">
          <div className="composer-tools">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              multiple
              hidden
              onChange={(event) => {
                handleFiles(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={gifFileInput}
              type="file"
              accept="image/gif"
              hidden
              onChange={(event) => {
                handleFiles(event.target.files);
                setGifOpen(false);
                event.currentTarget.value = '';
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={Boolean(poll) || media.length >= 4}
              aria-label="Add photos or video"
            >
              <Icon name="image" size={21} />
            </button>
            <button
              onClick={() => setGifOpen(true)}
              disabled={Boolean(poll) || media.length >= 1}
              aria-label="Add a GIF"
            >
              <Icon name="gif" size={21} />
            </button>
            <button
              onClick={() => setPoll({ options: ['', ''], days: 1, hours: 0, minutes: 0 })}
              disabled={media.length > 0 || Boolean(poll)}
              aria-label="Add poll"
            >
              <Icon name="poll" size={21} />
            </button>
            <span className="emoji-wrap">
              <button onClick={() => setEmojiOpen((value) => !value)} aria-label="Add emoji">
                <Icon name="emoji" size={21} />
              </button>
              {emojiOpen && (
                <EmojiPicker
                  onPick={(emoji) => {
                    setText((value) => value + emoji);
                    setEmojiOpen(false);
                  }}
                />
              )}
            </span>
            {!replyTo && (
              <button onClick={() => setScheduleOpen(true)} aria-label="Schedule Tweet">
                <Icon name="calendar" size={21} />
              </button>
            )}
          </div>
          <div className="composer-submit">
            {count > 0 && <CharacterCounter remaining={remaining} />}
            {!replyTo && !scheduledAt && (
              <button
                className="composer-save-draft"
                onClick={() => void submit(true)}
                disabled={!canPost}
              >
                {savingDraft ? 'Saving…' : 'Save draft'}
              </button>
            )}
            <button
              className="button button-primary"
              onClick={() => void submit()}
              disabled={!canPost}
            >
              {submitting ? (
                <Spinner label="Sending Tweet" />
              ) : scheduledAt ? (
                'Schedule'
              ) : replyTo ? (
                'Reply'
              ) : (
                'Tweet'
              )}
            </button>
          </div>
        </div>
      </div>
      <ScheduleModal
        open={scheduleOpen}
        initial={scheduledAt}
        onClose={() => setScheduleOpen(false)}
        onSave={(value) => {
          setScheduledAt(value);
          setScheduleOpen(false);
        }}
      />
      <GifPickerModal
        open={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(gif) => void chooseGif(gif)}
        onUpload={() => gifFileInput.current?.click()}
      />
    </section>
  );
}

type GifResult = {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
};

function GifPickerModal({
  open,
  onClose,
  onSelect,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
  onUpload: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        apiFetch<{ items: GifResult[] }>(`/api/v1/gifs?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        })
          .then((result) => {
            if (!cancelled) setItems(result.items);
          })
          .catch((reason: unknown) => {
            if (!cancelled && !(reason instanceof DOMException && reason.name === 'AbortError')) {
              setError(reason instanceof Error ? reason.message : 'GIFs could not be loaded.');
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  return (
    <Modal open={open} onClose={onClose} title="Choose a GIF" className="gif-picker-modal">
      <div className="gif-search">
        <Icon name="search" size={20} />
        <input
          value={query}
          maxLength={50}
          autoFocus
          placeholder="Search for GIFs"
          aria-label="Search for GIFs"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading && (
        <div className="gif-picker-loading">
          <Spinner label="Loading GIFs" />
        </div>
      )}
      {error && <div className="composer-error gif-picker-error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="gif-picker-empty">No GIFs found. Try another search.</div>
      )}
      {!error && items.length > 0 && (
        <div className="gif-grid">
          {items.map((gif) => (
            <button key={gif.id} onClick={() => onSelect(gif)} title={gif.title}>
              <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="gif-picker-footer">
        <button onClick={onUpload}>Upload a GIF</button>
        <small className="giphy-credit">Powered by GIPHY</small>
      </div>
    </Modal>
  );
}

function CharacterCounter({ remaining }: { remaining: number }) {
  const progress = Math.min(100, Math.max(0, ((280 - remaining) / 280) * 100));
  return (
    <div
      className={`character-counter ${remaining < 20 ? 'near-limit' : ''} ${remaining < 0 ? 'over-limit' : ''}`}
      aria-label={`${remaining} characters remaining`}
    >
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <circle
          className="progress"
          cx="12"
          cy="12"
          r="9"
          style={{ strokeDashoffset: 56.55 - (56.55 * progress) / 100 }}
        />
      </svg>
      {remaining < 20 && <span>{remaining}</span>}
    </div>
  );
}

function AudienceMenu({
  value,
  onChange,
}: {
  value: 'everyone' | 'following' | 'mentioned';
  onChange: (value: 'everyone' | 'following' | 'mentioned') => void;
}) {
  const items = [
    {
      value: 'everyone' as const,
      icon: 'globe' as const,
      title: 'Everyone',
      body: 'Anyone on or off Twitter',
    },
    {
      value: 'following' as const,
      icon: 'people' as const,
      title: 'People you follow',
      body: 'Accounts you follow',
    },
    {
      value: 'mentioned' as const,
      icon: 'user' as const,
      title: 'Only people you mention',
      body: 'Only accounts in this Tweet',
    },
  ];
  return (
    <div className="audience-menu">
      <h3>Who can reply?</h3>
      {items.map((item) => (
        <button key={item.value} onClick={() => onChange(item.value)}>
          <span className="audience-menu-icon">
            <Icon name={item.icon} />
          </span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </span>
          {value === item.value && <Icon name="check" size={20} />}
        </button>
      ))}
    </div>
  );
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const emojis = [
    '😀',
    '😂',
    '😍',
    '🥳',
    '😢',
    '😡',
    '👍',
    '👏',
    '❤️',
    '🔥',
    '🎉',
    '✨',
    '🤔',
    '👀',
    '🙏',
    '🌍',
  ];
  return (
    <div className="emoji-picker" aria-label="Emoji picker">
      {emojis.map((emoji) => (
        <button key={emoji} onClick={() => onPick(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

function PollEditor({
  value,
  onChange,
  onRemove,
}: {
  value: PollDraft;
  onChange: (value: PollDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="poll-editor">
      <div className="poll-options">
        {value.options.map((option, index) => (
          <div key={index}>
            <label>
              <span>Choice {index + 1}</span>
              <input
                maxLength={25}
                value={option}
                onChange={(event) =>
                  onChange({
                    ...value,
                    options: value.options.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  })
                }
              />
            </label>
            {index === value.options.length - 1 && value.options.length < 4 && (
              <button
                onClick={() => onChange({ ...value, options: [...value.options, ''] })}
                aria-label="Add a choice"
              >
                <Icon name="plus" size={20} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="poll-length">
        <span>Poll length</span>
        <div>
          <label>
            Days
            <select
              value={value.days}
              onChange={(event) => onChange({ ...value, days: Number(event.target.value) })}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label>
            Hours
            <select
              value={value.hours}
              onChange={(event) => onChange({ ...value, hours: Number(event.target.value) })}
            >
              {Array.from({ length: 24 }).map((_, i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label>
            Minutes
            <select
              value={value.minutes}
              onChange={(event) => onChange({ ...value, minutes: Number(event.target.value) })}
            >
              {[0, 5, 10, 15, 20, 30, 45].map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <button className="remove-poll" onClick={onRemove}>
        Remove poll
      </button>
    </div>
  );
}

function ScheduleModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [minimum, setMinimum] = useState(() => localDateTimeValue(new Date()));
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    // Reopening the scheduler should always use a current minimum and a fresh default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinimum(localDateTimeValue(now));
    setValue(initial || localDateTimeValue(new Date(now.getTime() + 3_600_000)));
  }, [initial, open]);
  const selectedTime = new Date(value).getTime();
  const minimumTime = new Date(minimum).getTime();
  const valid = Boolean(value) && Number.isFinite(selectedTime) && selectedTime > minimumTime;
  return (
    <Modal open={open} onClose={onClose} title="Schedule Tweet" className="schedule-modal">
      <div className="schedule-heading">
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <h2>Schedule</h2>
        <button className="schedule-confirm" onClick={() => onSave(value)} disabled={!valid}>
          Confirm
        </button>
      </div>
      <div className="schedule-body">
        <h3>Date and time</h3>
        <label>
          Date and time
          <input
            type="datetime-local"
            min={minimum}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p>
          <Icon name="globe" size={17} /> Time zone:{' '}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </div>
    </Modal>
  );
}
