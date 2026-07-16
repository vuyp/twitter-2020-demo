'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AppShell, EmptyState, ErrorState, PageHeader, Tabs } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { Avatar, Modal, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { Timeline } from '@/components/timeline/timeline';
import { TweetCard } from '@/components/timeline/tweet-card';
import { apiFetch, useApi } from '@/hooks/use-api';
import { normalizeTweet, normalizeUser, type Tweet, type User } from '@/components/types';
import { useSession, useToast } from '@/components/providers/app-providers';
import '@/styles/collections.css';

function record(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function listFrom(value: unknown) {
  const source = record(value);
  return Array.isArray(value) ? value : Array.isArray(source.items) ? source.items : [];
}

function DeleteConfirmation({
  open,
  title,
  body,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      className="confirm-modal"
    >
      <div className="confirm-dialog">
        <h2>{title}</h2>
        <p>{body}</p>
        <button className="button confirm-delete" disabled={busy} onClick={onConfirm}>
          {busy ? <Spinner /> : 'Delete'}
        </button>
        <button className="button confirm-cancel" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

type BannerMediaDraft = { file: File; previewUrl: string };

const BANNER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BANNER_BYTES = 15 * 1024 * 1024;

function useBannerMediaDraft() {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<BannerMediaDraft | null>(null);

  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.previewUrl);
    },
    [draft],
  );

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (!BANNER_IMAGE_TYPES.has(file.type)) {
      showToast('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size === 0 || file.size > MAX_BANNER_BYTES) {
      showToast('Images must be larger than 0 bytes and no more than 15 MB.');
      return;
    }
    setDraft({ file, previewUrl: URL.createObjectURL(file) });
  };

  return { draft, chooseFile };
}

async function uploadBannerMedia(file?: File): Promise<string | undefined> {
  if (!file) return undefined;
  const signed = await apiFetch<{
    id?: string;
    mediaId?: string;
    uploadUrl: string;
    headers?: Record<string, string>;
  }>('/api/v1/media/presign', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      purpose: 'banner',
    }),
  });
  const mediaId = signed.mediaId || signed.id;
  if (!mediaId) throw new Error('Twitter couldn\u2019t prepare that image for upload.');
  const upload = await fetch(signed.uploadUrl, {
    method: 'PUT',
    ...(signed.headers ? { headers: signed.headers } : {}),
    body: file,
  });
  if (!upload.ok) throw new Error('The image upload didn\u2019t finish. Please try again.');
  await apiFetch('/api/v1/media/finalize', {
    method: 'POST',
    body: JSON.stringify({ mediaId }),
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await apiFetch<{
      status?: string;
      processingStatus?: string;
      error?: string;
    }>(`/api/v1/media/${mediaId}`);
    const state = status.processingStatus || status.status;
    if (state === 'ready') return mediaId;
    if (state === 'failed')
      throw new Error(status.error || 'Twitter couldn\u2019t process that image.');
    if (attempt === 19)
      throw new Error('The image is taking too long to process. Please try again.');
    await new Promise((resolve) => window.setTimeout(resolve, 600));
  }
  return mediaId;
}

export function BookmarksScreen() {
  return (
    <AppShell>
      <PageHeader title="Bookmarks" />
      <Timeline
        endpoint="/api/v1/bookmarks"
        emptyTitle="You haven’t added any Tweets to your Bookmarks yet"
        emptyBody="When you do, they’ll show up here."
      />
    </AppShell>
  );
}

type ListSummary = {
  id: string;
  name: string;
  description?: string | undefined;
  private: boolean;
  membersCount: number;
  followersCount: number;
  following: boolean;
  bannerUrl?: string | undefined;
  owner?: User | undefined;
  members?: User[] | undefined;
};
function normalizeList(value: unknown): ListSummary {
  const source = record(value);
  return {
    id: String(source.id || ''),
    name: String(source.name || 'Untitled List'),
    description: typeof source.description === 'string' ? source.description : undefined,
    private: Boolean(source.private || source.isPrivate),
    membersCount: Number(source.membersCount) || 0,
    followersCount: Number(source.followersCount) || 0,
    following: Boolean(source.following),
    bannerUrl: typeof source.bannerUrl === 'string' ? source.bannerUrl : undefined,
    owner: source.owner ? normalizeUser(source.owner) : undefined,
    members: Array.isArray(source.members) ? source.members.map(normalizeUser) : undefined,
  };
}

export function ListsScreen({ tab = 'owned' }: { tab?: 'owned' | 'subscribed' | 'member' }) {
  const { viewer } = useSession();
  const { data, loading, error, reload } = useApi<unknown>(`/api/v1/lists?filter=${tab}`);
  const lists = useMemo(() => listFrom(data).map(normalizeList), [data]);
  return (
    <AppShell>
      <PageHeader
        title="Lists"
        subtitle={viewer?.handle ? `@${viewer.handle}` : undefined}
        action={
          <Link className="icon-button" href="/i/lists/new" aria-label="Create a List">
            <Icon name="plus" size={22} />
          </Link>
        }
      />
      <Tabs
        items={[
          { label: 'Owned', href: '/i/lists', active: tab === 'owned' },
          { label: 'Subscribed', href: '/i/lists/subscribed', active: tab === 'subscribed' },
          { label: 'Member', href: '/i/lists/member', active: tab === 'member' },
        ]}
      />
      {loading && <CollectionLoading />}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && lists.length === 0 && (
        <EmptyState
          icon="list"
          title={
            tab === 'owned'
              ? 'You haven’t created any Lists yet'
              : tab === 'subscribed'
                ? 'You aren’t subscribed to any Lists'
                : 'You haven’t been added to any Lists'
          }
          body={
            tab === 'owned'
              ? 'When you do, they’ll show up here.'
              : 'When that changes, you’ll see those Lists here.'
          }
          action={
            tab === 'owned' ? (
              <Link className="button button-primary" href="/i/lists/new">
                Create a List
              </Link>
            ) : undefined
          }
        />
      )}
      {lists.map((list) => (
        <ListRow key={list.id} list={list} />
      ))}
    </AppShell>
  );
}

function ListRow({ list }: { list: ListSummary }) {
  return (
    <Link className="list-row" href={`/i/lists/${list.id}`}>
      <span
        className={`list-art ${list.bannerUrl ? 'has-image' : ''}`}
        style={list.bannerUrl ? { backgroundImage: `url(${list.bannerUrl})` } : undefined}
      >
        {!list.bannerUrl && <Icon name="list" size={28} />}
      </span>
      <span>
        <strong>
          {list.name}
          {list.private && <Icon name="lock" size={14} />}
        </strong>
        {list.description && <p>{list.description}</p>}
        <small>
          {list.membersCount} {list.membersCount === 1 ? 'member' : 'members'} ·{' '}
          {list.followersCount} {list.followersCount === 1 ? 'follower' : 'followers'}
        </small>
        {list.owner && (
          <small>
            by {list.owner.name} @{list.owner.handle}
          </small>
        )}
      </span>
      <Icon name="chevron" size={19} />
    </Link>
  );
}

export function ListDetailScreen({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi<unknown>(`/api/v1/lists/${id}`);
  const [followingOverride, setFollowingOverride] = useState<boolean | undefined>(undefined);
  const [followersDelta, setFollowersDelta] = useState(0);
  const list = data ? normalizeList(data) : null;
  if (loading)
    return (
      <AppShell publicAccess>
        <PageHeader title="List" back />
        <CollectionLoading />
      </AppShell>
    );
  if (error || !list)
    return (
      <AppShell publicAccess>
        <PageHeader title="List" back />
        <ErrorState message={error || 'This List isn’t available.'} retry={reload} />
      </AppShell>
    );
  return (
    <AppShell publicAccess>
      <PageHeader
        title={list.name}
        subtitle="List"
        back
        action={
          <ListActions
            list={list}
            following={followingOverride ?? list.following}
            onMembersChanged={reload}
            onFollowingChange={(next) => {
              const previous = followingOverride ?? list.following;
              setFollowingOverride(next);
              if (previous !== next) setFollowersDelta((value) => value + (next ? 1 : -1));
            }}
          />
        }
      />
      <div className="list-detail-head">
        <div
          className={`list-detail-art ${list.bannerUrl ? 'has-image' : ''}`}
          style={list.bannerUrl ? { backgroundImage: `url(${list.bannerUrl})` } : undefined}
        >
          {!list.bannerUrl && <Icon name="list" size={52} />}
        </div>
        <h1>
          {list.name}
          {list.private && <Icon name="lock" size={17} />}
        </h1>
        {list.description && <p>{list.description}</p>}
        {list.owner && (
          <Link href={`/${list.owner.handle}`}>
            <Avatar user={list.owner} size={22} />
            <strong>{list.owner.name}</strong> @{list.owner.handle}
          </Link>
        )}
        <div>
          <span>
            <strong>{list.membersCount}</strong> {list.membersCount === 1 ? 'Member' : 'Members'}
          </span>
          <span>
            <strong>{Math.max(0, list.followersCount + followersDelta)}</strong>{' '}
            {Math.max(0, list.followersCount + followersDelta) === 1 ? 'Follower' : 'Followers'}
          </span>
        </div>
      </div>
      <Timeline
        endpoint={`/api/v1/lists/${id}/timeline`}
        emptyTitle="There aren’t any Tweets in this List yet"
        emptyBody="Tweets from List members will show up here."
      />
    </AppShell>
  );
}

function ListActions({
  list,
  following,
  onMembersChanged,
  onFollowingChange,
}: {
  list: ListSummary;
  following: boolean;
  onMembersChanged: () => void;
  onFollowingChange: (following: boolean) => void;
}) {
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const own = Boolean(
    viewer &&
    list.owner &&
    (viewer.id === list.owner.id ||
      viewer.handle.toLowerCase() === list.owner.handle.toLowerCase()),
  );

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [menuOpen]);

  const changeFollow = async () => {
    if (!viewer) {
      router.push('/login');
      return;
    }
    const next = !following;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/lists/${list.id}/follow`, {
        method: next ? 'POST' : 'DELETE',
        ...(next ? { body: JSON.stringify({}) } : {}),
      });
      onFollowingChange(next);
      setMenuOpen(false);
      showToast(next ? `You followed ${list.name}.` : `You unfollowed ${list.name}.`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That List could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const deleteList = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/lists/${list.id}`, { method: 'DELETE' });
      showToast('Your List was deleted.');
      router.replace('/i/lists');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your List could not be deleted.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className="list-actions" ref={wrapperRef}>
        <button
          className="icon-button"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Icon name="more" size={21} />
        </button>
        {menuOpen && (
          <div className="list-actions-menu" role="menu">
            {own ? (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setManageOpen(true);
                  }}
                >
                  <Icon name="people" size={20} />
                  Manage members
                </button>
                <button
                  className="danger"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Icon name="trash" size={20} />
                  Delete List
                </button>
              </>
            ) : (
              <button role="menuitem" disabled={busy} onClick={() => void changeFollow()}>
                {busy ? <Spinner /> : <Icon name={following ? 'check' : 'plus'} size={20} />}
                {following ? 'Unfollow List' : 'Follow List'}
              </button>
            )}
          </div>
        )}
      </div>
      {own && (
        <ManageListMembersModal
          list={list}
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          onChanged={onMembersChanged}
        />
      )}
      <DeleteConfirmation
        open={deleteConfirmOpen}
        title="Delete List?"
        body="This can’t be undone and the List will be removed from your account."
        busy={busy}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void deleteList()}
      />
    </>
  );
}

function ManageListMembersModal({
  list,
  open,
  onClose,
  onChanged,
}: {
  list: ListSummary;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [knownMembers, setKnownMembers] = useState<User[]>(list.members || []);
  const [membership, setMembership] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((list.members || []).map((user) => [user.id, true])),
  );
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const searchPath =
    query.trim().length >= 2
      ? `/api/v1/search?q=${encodeURIComponent(query.trim())}&type=people&limit=20`
      : null;
  const { data, loading, error } = useApi<unknown>(searchPath);
  const results = useMemo(
    () =>
      listFrom(data).flatMap((item) => {
        const source = record(item);
        if (source.kind && source.kind !== 'user') return [];
        const user = normalizeUser(source.user || item);
        return user.id ? [user] : [];
      }),
    [data],
  );
  const members = knownMembers.filter((user) => membership[user.id]);
  const displayedUsers = searchPath ? results : members;

  const changeMembership = async (user: User) => {
    const next = !membership[user.id];
    setBusyIds((current) => ({ ...current, [user.id]: true }));
    try {
      await apiFetch(`/api/v1/lists/${list.id}/members/${user.id}`, {
        method: next ? 'POST' : 'DELETE',
      });
      setMembership((current) => ({ ...current, [user.id]: next }));
      setKnownMembers((current) =>
        current.some((item) => item.id === user.id) ? current : [...current, user],
      );
      onChanged();
      showToast(next ? `${user.name} was added to the List.` : `${user.name} was removed.`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That member could not be updated.');
    } finally {
      setBusyIds((current) => ({ ...current, [user.id]: false }));
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <Modal open onClose={onClose} title="Manage members" className="list-members-modal">
      <div className="list-members-header">
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" size={21} />
        </button>
        <h2>Manage members</h2>
        <span aria-hidden="true" />
      </div>
      <label className="list-members-search">
        <Icon name="search" size={19} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
        {query && (
          <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={15} />
          </button>
        )}
      </label>
      <div className="list-members-section-title">{searchPath ? 'Search results' : 'Members'}</div>
      <div className="list-members-results" aria-live="polite">
        {loading && (
          <div className="list-members-status">
            <Spinner />
          </div>
        )}
        {!loading && error && <div className="list-members-status">{error}</div>}
        {!loading && !error && !searchPath && !members.length && (
          <div className="list-members-empty">
            <Icon name="people" size={42} />
            <h3>Add people to this List</h3>
            <p>Search for people by their name or username.</p>
          </div>
        )}
        {!loading && !error && searchPath && !results.length && (
          <div className="list-members-empty compact">
            <h3>No people found</h3>
            <p>Try searching for something else.</p>
          </div>
        )}
        {!loading &&
          !error &&
          displayedUsers.map((user) => {
            const member = Boolean(membership[user.id]);
            const busy = Boolean(busyIds[user.id]);
            return (
              <div className="list-member-row" key={user.id}>
                <Link href={`/${user.handle}`} onClick={onClose}>
                  <Avatar user={user} size={48} />
                </Link>
                <Link className="list-member-identity" href={`/${user.handle}`} onClick={onClose}>
                  <strong>
                    {user.name}
                    {user.verified && <VerifiedBadge />}
                  </strong>
                  <small>@{user.handle}</small>
                  {user.bio && <p>{user.bio}</p>}
                </Link>
                <button
                  className={`button list-member-button ${member ? 'is-member' : ''}`}
                  disabled={busy}
                  onClick={() => void changeMembership(user)}
                  aria-label={`${member ? 'Remove' : 'Add'} ${user.name} ${member ? 'from' : 'to'} this List`}
                >
                  {busy ? <Spinner /> : member ? 'Remove' : 'Add'}
                </button>
              </div>
            );
          })}
      </div>
    </Modal>,
    document.body,
  );
}

export function NewListScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const banner = useBannerMediaDraft();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const bannerMediaId = await uploadBannerMedia(banner.draft?.file);
      const created = normalizeList(
        await apiFetch<unknown>('/api/v1/lists', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            private: isPrivate,
            ...(bannerMediaId ? { bannerMediaId } : {}),
          }),
        }),
      );
      router.push(`/i/lists/${created.id}`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your List couldn’t be created.');
      setSaving(false);
    }
  };
  return (
    <AppShell>
      <PageHeader
        title="Create a new List"
        back
        action={
          <button
            className="button button-primary header-save"
            disabled={!name.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? <Spinner /> : 'Next'}
          </button>
        }
      />
      <div className="list-form">
        <label
          className={`list-banner-picker ${banner.draft ? 'has-image' : ''} ${saving ? 'is-disabled' : ''}`}
          style={banner.draft ? { backgroundImage: `url(${banner.draft.previewUrl})` } : undefined}
        >
          <input
            className="collection-media-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            aria-label={banner.draft ? 'Change List photo' : 'Add a List photo'}
            onChange={(event) => {
              banner.chooseFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {banner.draft && <span className="collection-media-shade" />}
          <span className="collection-media-prompt">
            <Icon name="camera" size={30} />
            <span>{banner.draft ? 'Change photo' : 'Add a photo'}</span>
          </span>
        </label>
        <label className="settings-field">
          <span>Name</span>
          <input value={name} maxLength={25} onChange={(event) => setName(event.target.value)} />
          <small>{name.length}/25</small>
        </label>
        <label className="settings-field">
          <span>Description</span>
          <textarea
            value={description}
            maxLength={100}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
          <small>{description.length}/100</small>
        </label>
        <label className="toggle-row">
          <span>
            <strong>Make private</strong>
            <small>When you make a List private, only you can see it.</small>
          </span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setPrivate(event.target.checked)}
          />
        </label>
      </div>
    </AppShell>
  );
}

type Topic = { id: string; name: string; description?: string | undefined; following: boolean };
function normalizeTopic(value: unknown): Topic {
  const source = record(value);
  return {
    id: String(source.id || source.slug || ''),
    name: String(source.name || ''),
    description: typeof source.description === 'string' ? source.description : undefined,
    following: Boolean(source.following),
  };
}

export function TopicsScreen({ view = 'following' }: { view?: 'following' | 'not_interested' }) {
  const { viewer } = useSession();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/topics');
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const topics = useMemo(() => listFrom(data).map(normalizeTopic), [data]);
  const dismissalKey = viewer ? `twitter-topic-dismissals:${viewer.id}` : null;
  useEffect(() => {
    if (!dismissalKey) return;
    try {
      const stored = JSON.parse(localStorage.getItem(dismissalKey) || '[]') as unknown;
      // Topic dismissals are a lightweight per-device preference in the 2020 client.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(Array.isArray(stored) ? stored.map(String) : []);
    } catch {
      setDismissed([]);
    }
  }, [dismissalKey]);
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const visibleTopics =
    view === 'following'
      ? topics.filter((topic) => !dismissedSet.has(topic.id))
      : topics.filter((topic) => dismissedSet.has(topic.id));
  const toggle = async (topic: Topic) => {
    if (!viewer) {
      router.push('/login');
      return;
    }
    const current = changes[topic.id] ?? topic.following;
    setChanges((value) => ({ ...value, [topic.id]: !current }));
    try {
      await apiFetch(`/api/v1/topics/${topic.id}/follow`, {
        method: current ? 'DELETE' : 'POST',
        ...(current ? {} : { body: JSON.stringify({}) }),
      });
    } catch {
      setChanges((value) => ({ ...value, [topic.id]: current }));
    }
  };
  const setNotInterested = (topic: Topic, value: boolean) => {
    if (!viewer || !dismissalKey) {
      router.push('/login');
      return;
    }
    const next = value
      ? [...new Set([...dismissed, topic.id])]
      : dismissed.filter((id) => id !== topic.id);
    setDismissed(next);
    localStorage.setItem(dismissalKey, JSON.stringify(next));
  };
  return (
    <AppShell publicAccess>
      <PageHeader title="Topics" back />
      <Tabs
        items={[
          { label: 'Following', href: '/i/topics', active: view === 'following' },
          {
            label: 'Not interested',
            href: '/i/topics/not_interested',
            active: view === 'not_interested',
          },
        ]}
      />
      {loading && <CollectionLoading />}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && visibleTopics.length === 0 && (
        <EmptyState
          icon="topic"
          title={view === 'following' ? 'Follow Topics you care about' : 'Nothing here yet'}
          body={
            view === 'following'
              ? 'Tweets about the Topics you follow will show up in your Home timeline.'
              : 'Topics you mark as not interested will show up here.'
          }
        />
      )}
      {visibleTopics.map((topic) => {
        const following = changes[topic.id] ?? topic.following;
        return (
          <div className="topic-row" key={topic.id}>
            <span>
              <strong>{topic.name}</strong>
              {topic.description && <small>{topic.description}</small>}
            </span>
            <div className="topic-actions">
              {view === 'not_interested' ? (
                <button className="button" onClick={() => setNotInterested(topic, false)}>
                  Undo
                </button>
              ) : (
                <>
                  {!following && (
                    <button className="topic-dismiss" onClick={() => setNotInterested(topic, true)}>
                      Not interested
                    </button>
                  )}
                  <button
                    className={`button ${following ? 'following' : ''}`}
                    onClick={() => void toggle(topic)}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </AppShell>
  );
}

type Moment = {
  id: string;
  title: string;
  description?: string | undefined;
  coverMediaUrl?: string | undefined;
  updatedAt?: string | undefined;
  published: boolean;
  owner?: User | undefined;
  ownerId?: string | undefined;
  isOwner?: boolean | undefined;
  tweets?: Tweet[] | undefined;
};
function normalizeMoment(value: unknown): Moment {
  const source = record(value);
  const owner = source.owner ? normalizeUser(source.owner) : undefined;
  return {
    id: String(source.id || ''),
    title: String(source.title || 'Untitled Moment'),
    description: typeof source.description === 'string' ? source.description : undefined,
    coverMediaUrl: typeof source.coverMediaUrl === 'string' ? source.coverMediaUrl : undefined,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    published: Boolean(source.published),
    owner,
    ownerId: source.ownerId ? String(source.ownerId) : owner?.id,
    isOwner: typeof source.isOwner === 'boolean' ? source.isOwner : undefined,
    tweets: Array.isArray(source.tweets) ? source.tweets.map(normalizeTweet) : undefined,
  };
}
export function MomentsScreen() {
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/moments');
  const moments = useMemo(() => listFrom(data).map(normalizeMoment), [data]);
  return (
    <AppShell publicAccess>
      <PageHeader
        title="Moments"
        back
        action={
          <Link className="icon-button" href="/i/moments/new" aria-label="Create Moment">
            <Icon name="plus" size={21} />
          </Link>
        }
      />
      {loading && <CollectionLoading />}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && moments.length === 0 && (
        <EmptyState
          icon="moment"
          title="You haven’t made any Moments yet"
          body="Curate Tweets into a story and share what’s happening."
          action={
            <Link className="button button-primary" href="/i/moments/new">
              Create new Moment
            </Link>
          }
        />
      )}
      {moments.map((moment) => (
        <Link className="moment-row" href={`/i/moments/${moment.id}`} key={moment.id}>
          <span
            className={`moment-art ${moment.coverMediaUrl ? 'has-image' : ''}`}
            style={
              moment.coverMediaUrl ? { backgroundImage: `url(${moment.coverMediaUrl})` } : undefined
            }
          >
            {!moment.coverMediaUrl && <Icon name="moment" size={34} />}
          </span>
          <span>
            <strong>{moment.title}</strong>
            {moment.description && <p>{moment.description}</p>}
            <small>
              {moment.published ? 'Published' : 'Draft'}
              {moment.updatedAt
                ? ` · Updated ${new Date(moment.updatedAt).toLocaleDateString()}`
                : ''}
            </small>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      ))}
    </AppShell>
  );
}

export function NewMomentScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const cover = useBannerMediaDraft();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const coverMediaId = await uploadBannerMedia(cover.draft?.file);
      const value = normalizeMoment(
        await apiFetch<unknown>('/api/v1/moments', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            ...(coverMediaId ? { coverMediaId } : {}),
          }),
        }),
      );
      router.push(`/i/moments/${value.id}`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your Moment couldn’t be created.');
      setSaving(false);
    }
  };
  return (
    <AppShell>
      <PageHeader
        title="Create Moment"
        back
        action={
          <button
            className="button button-primary header-save"
            disabled={!title.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? <Spinner /> : 'Save'}
          </button>
        }
      />
      <div className="moment-form">
        <label
          className={`moment-cover ${cover.draft ? 'has-image' : ''} ${saving ? 'is-disabled' : ''}`}
          style={cover.draft ? { backgroundImage: `url(${cover.draft.previewUrl})` } : undefined}
        >
          <input
            className="collection-media-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            aria-label={cover.draft ? 'Change Moment cover' : 'Choose a Moment cover'}
            onChange={(event) => {
              cover.chooseFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {cover.draft && <span className="collection-media-shade" />}
          <span className="collection-media-prompt">
            <Icon name="camera" size={40} />
            <span>{cover.draft ? 'Change cover' : 'Choose a cover'}</span>
          </span>
        </label>
        <label>
          Title
          <input
            autoFocus
            value={title}
            maxLength={70}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            maxLength={250}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <p>Add Tweets after saving this Moment.</p>
      </div>
    </AppShell>
  );
}

export function MomentDetailScreen({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi<unknown>(`/api/v1/moments/${id}`);
  const { viewer } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [tweetId, setTweetId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const moment = data ? normalizeMoment(data) : null;
  const isOwner = Boolean(
    moment &&
    (moment.isOwner ??
      (viewer &&
        (moment.ownerId === viewer.id ||
          moment.owner?.handle.toLowerCase() === viewer.handle.toLowerCase()))),
  );
  const save = async (title: string, description: string) => {
    if (!isOwner) return;
    try {
      await apiFetch(`/api/v1/moments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description }),
      });
      setEditing(false);
      reload();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This Moment could not be saved.');
    }
  };
  const addTweet = async () => {
    if (!isOwner) return;
    const match = tweetId.match(/(?:status\/)?(\d+)$/);
    if (!match?.[1]) {
      showToast('Paste a valid Tweet URL or Tweet ID.');
      return;
    }
    try {
      await apiFetch(`/api/v1/moments/${id}/tweets`, {
        method: 'POST',
        body: JSON.stringify({ tweetId: match[1] }),
      });
      setTweetId('');
      reload();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That Tweet could not be added.');
    }
  };
  const publish = async () => {
    if (!isOwner || moment?.published) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/v1/moments/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
      showToast('Your Moment was published.');
      reload();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This Moment could not be published.');
    } finally {
      setPublishing(false);
    }
  };
  const removeTweet = async (idToRemove: string) => {
    if (!isOwner) return;
    try {
      await apiFetch(`/api/v1/moments/${id}/tweets/${idToRemove}`, { method: 'DELETE' });
      reload();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That Tweet could not be removed.');
    }
  };
  const deleteMoment = async () => {
    if (!isOwner || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/moments/${id}`, { method: 'DELETE' });
      showToast('Your Moment was deleted.');
      router.replace('/i/moments');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This Moment could not be deleted.');
      setDeleting(false);
    }
  };
  return (
    <AppShell publicAccess>
      <PageHeader
        title={moment?.title || 'Moment'}
        subtitle={moment?.published ? 'Published' : 'Draft'}
        back
        action={
          moment &&
          isOwner && (
            <MomentOwnerActions
              moment={moment}
              publishing={publishing}
              deleting={deleting}
              onPublish={publish}
              onDelete={() => setDeleteConfirmOpen(true)}
            />
          )
        }
      />
      {loading && <CollectionLoading />}
      {error && <ErrorState message={error} retry={reload} />}
      {moment && (
        <>
          <div className="moment-detail-head">
            {moment.coverMediaUrl ? (
              <span
                className="moment-detail-cover"
                style={{ backgroundImage: `url(${moment.coverMediaUrl})` }}
              />
            ) : (
              <span className="moment-art">
                <Icon name="moment" size={38} />
              </span>
            )}
            {editing && isOwner ? (
              <MomentEditForm moment={moment} onSave={save} onCancel={() => setEditing(false)} />
            ) : (
              <>
                <h1>{moment.title}</h1>
                {moment.description && <p>{moment.description}</p>}
                {moment.owner && (
                  <Link className="moment-owner" href={`/${moment.owner.handle}`}>
                    <Avatar user={moment.owner} size={22} />
                    <strong>{moment.owner.name}</strong>
                    <span>@{moment.owner.handle}</span>
                  </Link>
                )}
                {isOwner && (
                  <button className="button" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
          {isOwner && (
            <div className="moment-add-tweet">
              <input
                value={tweetId}
                onChange={(event) => setTweetId(event.target.value)}
                placeholder="Paste a Tweet URL"
                aria-label="Tweet URL"
              />
              <button className="button" onClick={() => void addTweet()} disabled={!tweetId.trim()}>
                Add
              </button>
            </div>
          )}
          {moment.tweets?.length ? (
            <section aria-label="Moment Tweets">
              {moment.tweets.map((tweet) => (
                <div className="moment-tweet" key={tweet.id}>
                  <TweetCard initialTweet={tweet} />
                  {isOwner && (
                    <button
                      className="moment-remove-tweet"
                      onClick={() => void removeTweet(tweet.id)}
                    >
                      Remove from Moment
                    </button>
                  )}
                </div>
              ))}
            </section>
          ) : (
            <EmptyState
              icon="moment"
              title={isOwner ? 'Add Tweets to your Moment' : 'There are no Tweets in this Moment'}
              body={
                isOwner
                  ? 'Paste a Tweet URL above to begin telling your story.'
                  : 'The creator hasn\u2019t added any Tweets yet.'
              }
            />
          )}
        </>
      )}
      <DeleteConfirmation
        open={deleteConfirmOpen}
        title="Delete Moment?"
        body="This can’t be undone and the Moment will be removed from your account."
        busy={deleting}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void deleteMoment()}
      />
    </AppShell>
  );
}

function MomentOwnerActions({
  moment,
  publishing,
  deleting,
  onPublish,
  onDelete,
}: {
  moment: Moment;
  publishing: boolean;
  deleting: boolean;
  onPublish: () => Promise<void>;
  onDelete: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [menuOpen]);

  return (
    <div className="moment-owner-actions" ref={wrapperRef}>
      <button
        className="button button-primary header-save"
        disabled={moment.published || publishing || deleting}
        onClick={() => void onPublish()}
      >
        {publishing ? <Spinner /> : moment.published ? 'Published' : 'Publish'}
      </button>
      <button
        className="icon-button"
        aria-label="More Moment actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <Icon name="more" size={21} />
      </button>
      {menuOpen && (
        <div className="list-actions-menu moment-actions-menu" role="menu">
          <button
            className="danger"
            role="menuitem"
            disabled={deleting}
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            {deleting ? <Spinner /> : <Icon name="trash" size={20} />}
            Delete Moment
          </button>
        </div>
      )}
    </div>
  );
}

function MomentEditForm({
  moment,
  onSave,
  onCancel,
}: {
  moment: Moment;
  onSave: (title: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(moment.title);
  const [description, setDescription] = useState(moment.description || '');
  return (
    <div className="moment-inline-edit">
      <input value={title} maxLength={70} onChange={(event) => setTitle(event.target.value)} />
      <textarea
        value={description}
        rows={3}
        maxLength={250}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div>
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button button-primary"
          disabled={!title.trim()}
          onClick={() => void onSave(title.trim(), description.trim())}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function ConnectPeopleScreen() {
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/suggestions');
  const users = useMemo(() => listFrom(data).map(normalizeUser), [data]);
  return (
    <AppShell>
      <PageHeader title="Connect" back />
      <div className="connect-heading">
        <h2>Suggested for you</h2>
        <p>You’ll see suggestions based on who you follow and what you’re interested in.</p>
      </div>
      {loading && <CollectionLoading />}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && !users.length && (
        <EmptyState
          icon="people"
          title="No suggestions available yet"
          body="Search for people or explore Topics to begin building your timeline."
          action={
            <Link className="button button-primary" href="/search">
              Search Twitter
            </Link>
          }
        />
      )}
      {users.map((user) => (
        <PersonRow user={user} key={user.id} />
      ))}
    </AppShell>
  );
}
function PersonRow({ user }: { user: User }) {
  const { viewer } = useSession();
  const { showToast } = useToast();
  const [following, setFollowing] = useState(Boolean(user.following));
  const [followRequested, setFollowRequested] = useState(Boolean(user.followRequested));
  const [pending, setPending] = useState(false);
  const changeFollow = async () => {
    if (pending || viewer?.id === user.id) return;
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
    <div className="connect-person">
      <Link href={`/${user.handle}`}>
        <Avatar user={user} size={48} />
      </Link>
      <span>
        <Link href={`/${user.handle}`}>
          <strong>
            {user.name}
            {user.verified && <VerifiedBadge />}
          </strong>
          <small>@{user.handle}</small>
        </Link>
        {user.bio && <p>{user.bio}</p>}
      </span>
      {viewer?.id !== user.id && (
        <button
          className={`button ${following || followRequested ? 'following' : ''}`}
          onClick={() => void changeFollow()}
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

function CollectionLoading() {
  return (
    <div className="collection-loading">
      <Spinner />
    </div>
  );
}
