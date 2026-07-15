/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, EmptyState, ErrorState, PageHeader, Tabs } from '@/components/shell/app-shell';
import { Avatar, Modal, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Timeline } from '@/components/timeline/timeline';
import { TweetCard } from '@/components/timeline/tweet-card';
import { TweetComposer } from '@/components/timeline/tweet-composer';
import { apiFetch, useApi } from '@/hooks/use-api';
import { normalizeTweet, normalizeUser, type User } from '@/components/types';
import { useSession, useToast } from '@/components/providers/app-providers';
import '@/styles/profile.css';

export type ProfileTab = 'tweets' | 'replies' | 'media' | 'likes';

type ProfileImagePurpose = 'avatar' | 'banner';
type ProfileImageDraft = { file: File; previewUrl: string };
type MediaStatus = {
  id?: string;
  mediaId?: string;
  status?: string;
  processingStatus?: string;
  error?: string;
};

const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROFILE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

async function uploadProfileImage(file: File, purpose: ProfileImagePurpose): Promise<string> {
  const signed = await apiFetch<{
    mediaId: string;
    uploadUrl: string;
    headers?: Record<string, string>;
  }>('/api/v1/media/presign', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      purpose,
    }),
  });
  if (!signed.mediaId || !signed.uploadUrl) {
    throw new Error(`Twitter couldn't prepare the ${purpose} upload.`);
  }

  const upload = await fetch(signed.uploadUrl, {
    method: 'PUT',
    ...(signed.headers ? { headers: signed.headers } : {}),
    body: file,
  });
  if (!upload.ok) throw new Error(`The ${purpose} upload didn't finish. Please try again.`);

  let media = await apiFetch<MediaStatus>('/api/v1/media/finalize', {
    method: 'POST',
    body: JSON.stringify({ mediaId: signed.mediaId }),
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = media.processingStatus || media.status;
    if (state === 'ready') return signed.mediaId;
    if (state === 'failed') {
      throw new Error(media.error || `Twitter couldn't process the ${purpose} image.`);
    }
    if (attempt === 39) {
      throw new Error(`The ${purpose} image is taking too long to process. Please try again.`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    media = await apiFetch<MediaStatus>(`/api/v1/media/${signed.mediaId}`);
  }
  throw new Error(`Twitter couldn't process the ${purpose} image.`);
}

export function ProfileScreen({ handle, tab = 'tweets' }: { handle: string; tab?: ProfileTab }) {
  const decodedHandle = decodeURIComponent(handle).replace(/^@/, '');
  const { viewer } = useSession();
  const { data, loading, error, reload } = useApi<unknown>(
    `/api/v1/users/${encodeURIComponent(decodedHandle)}`,
  );
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const [requestOverride, setRequestOverride] = useState<boolean | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [blockOverride, setBlockOverride] = useState<boolean | null>(null);
  const [muteOverride, setMuteOverride] = useState<boolean | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const user = data ? normalizeUser(data) : null;
  const own = Boolean(
    user &&
    viewer &&
    (user.id === viewer.id || user.handle.toLowerCase() === viewer.handle.toLowerCase()),
  );
  const following = followOverride ?? Boolean(user?.following);
  const followRequested = requestOverride ?? Boolean(user?.followRequested);
  const blocking = blockOverride ?? Boolean(user?.blocking);
  const muting = muteOverride ?? Boolean(user?.muting);
  const endpoint =
    tab === 'tweets'
      ? `/api/v1/users/${encodeURIComponent(decodedHandle)}/tweets`
      : `/api/v1/users/${encodeURIComponent(decodedHandle)}/tweets?tab=${tab}`;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const toggleFollow = async () => {
    if (!user) return;
    if (followPending) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    const wasFollowing = following;
    const wasRequested = followRequested;
    const active = wasFollowing || wasRequested;
    setFollowOverride(active ? false : !user.protected);
    setRequestOverride(active ? false : Boolean(user.protected));
    setFollowPending(true);
    try {
      const result = await apiFetch<{ state?: 'following' | 'requested' | 'not-following' }>(
        `/api/v1/users/${encodeURIComponent(user.handle)}/follow`,
        {
          method: active ? 'DELETE' : 'POST',
          ...(active ? {} : { body: JSON.stringify({}) }),
        },
      );
      setFollowOverride(result.state === 'following');
      setRequestOverride(result.state === 'requested');
    } catch (reason) {
      setFollowOverride(wasFollowing);
      setRequestOverride(wasRequested);
      showToast(reason instanceof Error ? reason.message : 'That follow request didn’t work.');
    } finally {
      setFollowPending(false);
    }
  };
  const startMessage = async () => {
    if (!user) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    try {
      const result = await apiFetch<unknown>('/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({ participantIds: [user.id] }),
      });
      const source =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
      router.push(source.id ? `/messages/${String(source.id)}` : '/messages');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'A conversation could not be started.');
    }
  };
  const reportUser = async () => {
    if (!user) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    try {
      await apiFetch('/api/v1/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'user',
          targetId: user.id,
          reason: 'other',
          details: 'Reported from profile menu',
        }),
      });
      showToast('Thanks. We’ll review this account.');
      setMenuOpen(false);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'This report could not be sent.');
    }
  };
  const copyProfileLink = async () => {
    if (!user) return;
    const url = `${window.location.origin}/${encodeURIComponent(user.handle)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setMenuOpen(false);
    showToast('Copied link to profile.');
  };
  const blockUser = async () => {
    if (!user) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    const previous = blocking;
    setBlockOverride(!previous);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(user.handle)}/block`, {
        method: previous ? 'DELETE' : 'POST',
        ...(previous ? {} : { body: JSON.stringify({}) }),
      });
      showToast(`@${user.handle} was ${previous ? 'unblocked' : 'blocked'}.`);
      setMenuOpen(false);
      reload();
    } catch (reason) {
      setBlockOverride(previous);
      showToast(reason instanceof Error ? reason.message : 'This account could not be blocked.');
    }
  };
  const muteUser = async () => {
    if (!user) return;
    if (!viewer) {
      router.push('/login');
      return;
    }
    const previous = muting;
    setMuteOverride(!previous);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(user.handle)}/mute`, {
        method: previous ? 'DELETE' : 'POST',
        ...(previous ? {} : { body: JSON.stringify({}) }),
      });
      showToast(`@${user.handle} was ${previous ? 'unmuted' : 'muted'}.`);
      setMenuOpen(false);
    } catch (reason) {
      setMuteOverride(previous);
      showToast(reason instanceof Error ? reason.message : 'This account could not be muted.');
    }
  };

  if (loading)
    return (
      <AppShell publicAccess>
        <PageHeader title={decodedHandle} back />
        <ProfileSkeleton />
      </AppShell>
    );
  if (error || !user)
    return (
      <AppShell publicAccess>
        <PageHeader title="Profile" back />
        <ErrorState message={error || 'This account doesn’t exist.'} retry={reload} />
      </AppShell>
    );

  return (
    <AppShell publicAccess>
      <PageHeader
        title={user.name}
        subtitle={`${user.tweetsCount?.toLocaleString() || 0} Tweets`}
        back
      />
      <section className="profile-header">
        <div className="profile-banner">
          {user.bannerUrl && <img src={user.bannerUrl} alt="" />}
        </div>
        <div className="profile-avatar-row">
          <Avatar user={user} size={134} className="profile-avatar" />
          <div className="profile-actions" ref={menuRef}>
            {!own && (
              <>
                <button
                  className="icon-button profile-secondary-action"
                  aria-label="More"
                  onClick={() => setMenuOpen((value) => !value)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <Icon name="more" size={21} />
                </button>
                {user.canDirectMessage && !blocking && (
                  <button
                    className="icon-button profile-secondary-action"
                    aria-label="Message"
                    onClick={() => void startMessage()}
                  >
                    <Icon name="mail" size={20} />
                  </button>
                )}
              </>
            )}
            {own ? (
              <button className="button edit-profile" onClick={() => setEditOpen(true)}>
                Edit profile
              </button>
            ) : (
              <button
                className={`button follow-profile ${following ? 'following' : ''}`}
                onClick={() => void toggleFollow()}
                disabled={followPending}
                aria-busy={followPending}
              >
                {followPending ? (
                  <Spinner label="Updating follow" />
                ) : followRequested ? (
                  'Pending'
                ) : user.protected && !following ? (
                  'Request to follow'
                ) : following ? (
                  'Following'
                ) : (
                  'Follow'
                )}
              </button>
            )}
            {menuOpen && (
              <div className="profile-menu" role="menu">
                <button role="menuitem" onClick={() => void copyProfileLink()}>
                  <Icon name="link" size={20} />
                  Copy link to profile
                </button>
                <button role="menuitem" onClick={() => void muteUser()}>
                  <Icon name="bell" size={20} />
                  {muting ? 'Unmute' : 'Mute'} @{user.handle}
                </button>
                <button className="danger" role="menuitem" onClick={() => void blockUser()}>
                  <Icon name="warning" size={20} />
                  {blocking ? 'Unblock' : 'Block'} @{user.handle}
                </button>
                <button className="danger" role="menuitem" onClick={() => void reportUser()}>
                  <Icon name="warning" size={20} />
                  Report @{user.handle}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="profile-copy">
          <h1>
            {user.name}
            {user.verified && <VerifiedBadge />}
            {user.protected && <Icon name="lock" size={18} />}
          </h1>
          <div className="profile-handle">
            @{user.handle}
            {user.followsYou && <span>Follows you</span>}
          </div>
          {user.bio && <p className="profile-bio">{user.bio}</p>}
          <div className="profile-meta">
            {user.location && (
              <span>
                <Icon name="location" size={18} />
                {user.location}
              </span>
            )}
            {user.website && (
              <a
                href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="link" size={18} />
                {user.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {user.createdAt && (
              <span>
                <Icon name="calendar" size={18} />
                Joined{' '}
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
          <div className="profile-counts">
            <Link href={`/${user.handle}/following`}>
              <strong>{user.followingCount?.toLocaleString() || 0}</strong> Following
            </Link>
            <Link href={`/${user.handle}/followers`}>
              <strong>{user.followersCount?.toLocaleString() || 0}</strong> Followers
            </Link>
          </div>
        </div>
      </section>
      <Tabs
        items={[
          { label: 'Tweets', href: `/${user.handle}`, active: tab === 'tweets' },
          {
            label: 'Tweets & replies',
            href: `/${user.handle}/with_replies`,
            active: tab === 'replies',
          },
          { label: 'Media', href: `/${user.handle}/media`, active: tab === 'media' },
          { label: 'Likes', href: `/${user.handle}/likes`, active: tab === 'likes' },
        ]}
      />
      {user.protected && !own && !following ? (
        <EmptyState
          icon="lock"
          title="These Tweets are protected"
          body={`Only confirmed followers have access to @${user.handle}’s Tweets and complete profile.`}
        />
      ) : (
        <Timeline
          endpoint={endpoint}
          refreshKey={tab}
          emptyTitle={emptyTitle(tab, own)}
          emptyBody={emptyBody(tab, own, user.handle)}
        />
      )}
      {editOpen && (
        <EditProfileModal
          open
          user={user}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}
    </AppShell>
  );
}

export function PeopleListScreen({
  handle,
  kind,
}: {
  handle: string;
  kind: 'followers' | 'following';
}) {
  const decoded = decodeURIComponent(handle).replace(/^@/, '');
  const { data, loading, error, reload } = useApi<unknown>(
    `/api/v1/users/${encodeURIComponent(decoded)}/${kind}`,
  );
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const raw = Array.isArray(data) ? data : Array.isArray(source.items) ? source.items : [];
  const users = raw.map((item) => {
    const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return normalizeUser(entry.user || item);
  });
  return (
    <AppShell publicAccess>
      <PageHeader
        title={kind === 'followers' ? 'Followers' : 'Following'}
        subtitle={`@${decoded}`}
        back
      />
      {loading && (
        <div className="tweet-detail-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && users.length === 0 && (
        <EmptyState
          icon="people"
          title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          body={
            kind === 'followers'
              ? 'When someone follows this account, they’ll show up here.'
              : 'When this account follows someone, they’ll show up here.'
          }
        />
      )}
      {users.map((person) => (
        <PeopleListRow user={person} key={person.id || person.handle} />
      ))}
    </AppShell>
  );
}

function PeopleListRow({ user }: { user: User }) {
  const { viewer } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState(Boolean(user.following));
  return (
    <div className="profile-person-row">
      <Link href={`/${user.handle}`}>
        <Avatar user={user} size={48} />
      </Link>
      <Link href={`/${user.handle}`}>
        <strong>
          {user.name}
          {user.verified && <VerifiedBadge />}
        </strong>
        <small>@{user.handle}</small>
        {user.bio && <p>{user.bio}</p>}
      </Link>
      <button
        className={`button ${following ? 'following' : ''}`}
        onClick={async () => {
          if (!viewer) {
            router.push('/login');
            return;
          }
          const before = following;
          setFollowing(!before);
          try {
            await apiFetch(`/api/v1/users/${user.handle}/follow`, {
              method: before ? 'DELETE' : 'POST',
              ...(before ? {} : { body: JSON.stringify({}) }),
            });
          } catch {
            setFollowing(before);
          }
        }}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

function emptyTitle(tab: ProfileTab, own: boolean) {
  if (tab === 'likes')
    return own ? 'You don’t have any likes yet' : 'This account hasn’t liked any Tweets';
  if (tab === 'media')
    return own
      ? 'You haven’t Tweeted any photos or videos yet'
      : 'This account hasn’t Tweeted media';
  if (tab === 'replies')
    return own ? 'You haven’t replied to any Tweets yet' : 'This account hasn’t replied yet';
  return own ? 'You haven’t Tweeted yet' : 'This account hasn’t Tweeted';
}
function emptyBody(tab: ProfileTab, own: boolean, handle: string) {
  if (tab === 'likes') return 'When a Tweet is liked, it’ll show up here.';
  if (tab === 'media') return 'When photos or videos are Tweeted, they’ll show up here.';
  if (tab === 'replies') return 'Replies will show up on this tab.';
  return own
    ? 'When you post a Tweet, it’ll show up here.'
    : `When @${handle} Tweets, they’ll show up here.`;
}

function ProfileSkeleton() {
  return (
    <div className="profile-skeleton">
      <div />
      <span />
      <span />
      <span />
    </div>
  );
}

function EditProfileModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [location, setLocation] = useState(user.location || '');
  const [website, setWebsite] = useState(user.website || '');
  const [avatarDraft, setAvatarDraft] = useState<ProfileImageDraft | null>(null);
  const [bannerDraft, setBannerDraft] = useState<ProfileImageDraft | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const previewUrl = avatarDraft?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [avatarDraft]);
  useEffect(() => {
    const previewUrl = bannerDraft?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [bannerDraft]);

  const avatarPreview =
    avatarDraft?.previewUrl ?? (avatarRemoved ? null : (user.avatarUrl ?? null));
  const bannerPreview =
    bannerDraft?.previewUrl ?? (bannerRemoved ? null : (user.bannerUrl ?? null));

  const chooseImage = (purpose: ProfileImagePurpose, file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    if (!PROFILE_IMAGE_TYPES.has(file.type)) {
      const message = 'Choose a JPEG, PNG, or WebP image.';
      setFormError(message);
      showToast(message);
      return;
    }
    if (file.size === 0 || file.size > PROFILE_IMAGE_MAX_BYTES) {
      const message = 'Profile images must be larger than 0 bytes and no more than 15 MB.';
      setFormError(message);
      showToast(message);
      return;
    }
    const draft = { file, previewUrl: URL.createObjectURL(file) };
    if (purpose === 'avatar') {
      setAvatarDraft(draft);
      setAvatarRemoved(false);
    } else {
      setBannerDraft(draft);
      setBannerRemoved(false);
    }
  };
  const save = async () => {
    setSaving(true);
    setFormError(null);
    setSaveStatus(avatarDraft || bannerDraft ? 'Uploading profile photos...' : 'Saving profile...');
    try {
      const [avatarMediaId, bannerMediaId] = await Promise.all([
        avatarDraft ? uploadProfileImage(avatarDraft.file, 'avatar') : Promise.resolve(undefined),
        bannerDraft ? uploadProfileImage(bannerDraft.file, 'banner') : Promise.resolve(undefined),
      ]);
      setSaveStatus('Saving profile...');
      const profileUpdate: {
        name: string;
        bio: string;
        location: string;
        websiteUrl: string;
        avatarMediaId?: string | null;
        bannerMediaId?: string | null;
      } = {
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        websiteUrl: website.trim(),
      };
      if (avatarMediaId) profileUpdate.avatarMediaId = avatarMediaId;
      else if (avatarRemoved) profileUpdate.avatarMediaId = null;
      if (bannerMediaId) profileUpdate.bannerMediaId = bannerMediaId;
      else if (bannerRemoved) profileUpdate.bannerMediaId = null;
      await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profileUpdate),
      });
      setSaving(false);
      setSaveStatus(null);
      showToast('Your profile was saved.');
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Your profile couldn't be saved.";
      setFormError(message);
      showToast(message);
      setSaving(false);
      setSaveStatus(null);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Edit profile"
      className="edit-profile-modal"
    >
      <div className="edit-profile-heading">
        <button className="icon-button" onClick={onClose} aria-label="Close" disabled={saving}>
          <Icon name="close" />
        </button>
        <h2>Edit profile</h2>
        <button className="edit-save" onClick={() => void save()} disabled={!name.trim() || saving}>
          {saving ? <Spinner /> : 'Save'}
        </button>
      </div>
      <input
        ref={bannerInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        onChange={(event) => {
          chooseImage('banner', event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={avatarInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        onChange={(event) => {
          chooseImage('avatar', event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div className={`edit-banner ${bannerPreview ? 'has-image' : ''}`}>
        {bannerPreview && <img src={bannerPreview} alt="Banner preview" />}
        <span className="edit-media-shade" aria-hidden="true" />
        <div className="edit-banner-controls">
          <button
            className="edit-media-button"
            type="button"
            onClick={() => bannerInput.current?.click()}
            aria-label={bannerPreview ? 'Change banner photo' : 'Add banner photo'}
            title={bannerPreview ? 'Change banner photo' : 'Add banner photo'}
            disabled={saving}
          >
            <Icon name="camera" size={21} />
          </button>
          {bannerPreview && (
            <button
              className="edit-media-button"
              type="button"
              onClick={() => {
                setBannerDraft(null);
                setBannerRemoved(true);
              }}
              aria-label="Remove banner photo"
              title="Remove banner photo"
              disabled={saving}
            >
              <Icon name="close" size={21} />
            </button>
          )}
        </div>
      </div>
      <div className="edit-avatar">
        <Avatar user={{ ...user, avatarUrl: avatarPreview }} size={112} />
        <span className="edit-media-shade" aria-hidden="true" />
        <div className="edit-avatar-controls">
          <button
            className="edit-media-button"
            type="button"
            onClick={() => avatarInput.current?.click()}
            aria-label={avatarPreview ? 'Change profile photo' : 'Add profile photo'}
            title={avatarPreview ? 'Change profile photo' : 'Add profile photo'}
            disabled={saving}
          >
            <Icon name="camera" size={19} />
          </button>
          {avatarPreview && (
            <button
              className="edit-media-button"
              type="button"
              onClick={() => {
                setAvatarDraft(null);
                setAvatarRemoved(true);
              }}
              aria-label="Remove profile photo"
              title="Remove profile photo"
              disabled={saving}
            >
              <Icon name="close" size={19} />
            </button>
          )}
        </div>
      </div>
      <div className="edit-fields">
        {saveStatus && (
          <p className="edit-profile-status" role="status">
            <Spinner label={saveStatus} />
            {saveStatus}
          </p>
        )}
        {formError && (
          <p className="edit-profile-error" role="alert">
            {formError}
          </p>
        )}
        <EditField label="Name" value={name} onChange={setName} maxLength={50} />
        <EditField label="Bio" value={bio} onChange={setBio} maxLength={160} textarea />
        <EditField label="Location" value={location} onChange={setLocation} maxLength={30} />
        <EditField label="Website" value={website} onChange={setWebsite} maxLength={100} />
      </div>
    </Modal>
  );
}
function EditField({
  label,
  value,
  onChange,
  maxLength,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  textarea?: boolean;
}) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      <small>
        {value.length}/{maxLength}
      </small>
      {textarea ? (
        <textarea
          rows={3}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function TweetDetailScreen({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi<unknown>(
    `/api/v1/tweets/${encodeURIComponent(id)}`,
  );
  const [replyKey, setReplyKey] = useState(0);
  const tweet = useMemo(() => (data ? normalizeTweet(data) : null), [data]);
  return (
    <AppShell publicAccess>
      <PageHeader title="Tweet" back />
      {loading && (
        <div className="tweet-detail-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && !tweet && (
        <EmptyState
          title="This Tweet is unavailable"
          body="It may have been deleted or made private."
        />
      )}
      {tweet && (
        <>
          <TweetCard initialTweet={tweet} detail />
          <TweetComposer replyTo={tweet} onCreated={() => setReplyKey((value) => value + 1)} />
          <Timeline
            endpoint={`/api/v1/tweets/${id}/replies`}
            refreshKey={replyKey}
            emptyTitle="No replies yet"
            emptyBody="Be the first to reply to this Tweet."
          />
        </>
      )}
    </AppShell>
  );
}
