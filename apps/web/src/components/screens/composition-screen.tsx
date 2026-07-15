'use client';

import { useMemo, useState } from 'react';
import { AppShell, EmptyState, ErrorState, PageHeader, Tabs } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { Modal, Spinner } from '@/components/ui/primitives';
import { apiFetch, useApi } from '@/hooks/use-api';
import { useToast } from '@/components/providers/app-providers';
import { weightedTweetLength } from '@twitter2020/contracts';
import '@/styles/collections.css';

type Composition = {
  id: string;
  text: string;
  updatedAt?: string | undefined;
  scheduledAt?: string | null;
  status?: string | undefined;
  mediaIds: string[];
  poll?: unknown;
  replyToId?: string | null;
  quoteTweetId?: string | null;
  replyAudience: 'everyone' | 'following' | 'mentioned';
  sensitive: boolean;
};
export function CompositionScreen({ scheduled = false }: { scheduled?: boolean }) {
  const endpoint = scheduled ? '/api/v1/scheduled-tweets' : '/api/v1/drafts';
  const { data, loading, error, reload } = useApi<unknown>(endpoint);
  const { showToast } = useToast();
  const [removing, setRemoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Composition | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const items = useMemo(() => {
    const source =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const raw = Array.isArray(data) ? data : Array.isArray(source.items) ? source.items : [];
    return raw.map((value) => {
      const item = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      return {
        id: String(item.id || ''),
        text: String(item.text || ''),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
        scheduledAt: typeof item.scheduledAt === 'string' ? item.scheduledAt : null,
        status: typeof item.status === 'string' ? item.status : undefined,
        mediaIds: Array.isArray(item.mediaIds) ? item.mediaIds.map(String) : [],
        poll: item.poll ?? undefined,
        replyToId: typeof item.replyToId === 'string' ? item.replyToId : null,
        quoteTweetId: typeof item.quoteTweetId === 'string' ? item.quoteTweetId : null,
        replyAudience:
          item.replyAudience === 'following' || item.replyAudience === 'mentioned'
            ? item.replyAudience
            : 'everyone',
        sensitive: Boolean(item.sensitive),
      } satisfies Composition;
    });
  }, [data]);
  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' });
      reload();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This item could not be removed.');
    } finally {
      setRemoving(null);
    }
  };
  const saveDraft = async () => {
    if (!editing || !editText.trim() || weightedTweetLength(editText) > 280 || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/drafts/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          text: editText.trim(),
          mediaIds: editing.mediaIds,
          ...(editing.poll ? { poll: editing.poll } : {}),
          ...(editing.replyToId ? { replyToId: editing.replyToId } : {}),
          ...(editing.quoteTweetId ? { quoteTweetId: editing.quoteTweetId } : {}),
          replyAudience: editing.replyAudience,
          sensitive: editing.sensitive,
          draft: true,
        }),
      });
      setEditing(null);
      reload();
      showToast('Your draft was updated.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This draft could not be updated.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <AppShell>
      <PageHeader title={scheduled ? 'Scheduled Tweets' : 'Unsent Tweets'} back />
      <Tabs
        items={[
          { label: 'Drafts', href: '/compose/drafts', active: !scheduled },
          { label: 'Scheduled', href: '/compose/scheduled', active: scheduled },
        ]}
      />
      {loading && (
        <div className="collection-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={scheduled ? 'calendar' : 'feather'}
          title={
            scheduled ? 'You don’t have any scheduled Tweets' : 'You don’t have any saved drafts'
          }
          body={
            scheduled
              ? 'Tweets you schedule will show up here.'
              : 'Save a Tweet for later and it’ll show up here.'
          }
        />
      )}
      {items.map((item) => (
        <article className="composition-row" key={item.id}>
          <div>
            <p>{item.text || 'Media Tweet'}</p>
            <small>
              {scheduled && item.scheduledAt
                ? `Scheduled for ${new Date(item.scheduledAt).toLocaleString()}`
                : item.updatedAt
                  ? `Last edited ${new Date(item.updatedAt).toLocaleString()}`
                  : ''}
              {item.status === 'failed' ? ' · Failed to send' : ''}
            </small>
          </div>
          <div className="composition-actions">
            {!scheduled && (
              <button
                className="icon-button"
                onClick={() => {
                  setEditing(item);
                  setEditText(item.text);
                }}
                aria-label="Edit draft"
              >
                <Icon name="feather" size={20} />
              </button>
            )}
            <button
              className="icon-button"
              disabled={removing === item.id}
              onClick={() => void remove(item.id)}
              aria-label="Delete"
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        </article>
      ))}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit draft"
        className="draft-edit-modal"
      >
        <div className="draft-edit-body">
          <textarea
            autoFocus
            maxLength={10_000}
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            aria-label="Draft Tweet text"
          />
          <div>
            <span className={weightedTweetLength(editText) > 280 ? 'over-limit' : ''}>
              {280 - weightedTweetLength(editText)}
            </span>
            <button
              className="button button-primary"
              disabled={!editText.trim() || weightedTweetLength(editText) > 280 || saving}
              onClick={() => void saveDraft()}
            >
              {saving ? <Spinner /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
