'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, EmptyState, ErrorState, PageHeader } from '@/components/shell/app-shell';
import { normalizeUser, type User } from '@/components/types';
import { Icon, type IconName } from '@/components/ui/icon';
import { Avatar, Modal, Spinner, VerifiedBadge } from '@/components/ui/primitives';
import {
  useSession,
  useTheme,
  useToast,
  type AccentName,
  type FontSizeName,
  type ThemeName,
} from '@/components/providers/app-providers';
import { apiFetch, useApi } from '@/hooks/use-api';
import '@/styles/settings.css';

type SettingsItem = { title: string; body?: string; href: string; icon?: IconName };
const settingsGroups: Array<{ title: string; items: SettingsItem[] }> = [
  {
    title: 'Your account',
    items: [
      {
        title: 'Account information',
        body: 'See your account information like your phone number and email address.',
        href: '/settings/account',
        icon: 'user',
      },
      { title: 'Change your password', href: '/settings/password', icon: 'lock' },
      {
        title: 'Download an archive of your data',
        href: '/settings/download_data',
        icon: 'external',
      },
      { title: 'Deactivate your account', href: '/settings/deactivate', icon: 'warning' },
    ],
  },
  {
    title: 'Login and security',
    items: [
      {
        title: 'Security',
        body: 'Manage your account’s security and keep track of your account’s usage.',
        href: '/settings/security',
        icon: 'lock',
      },
      {
        title: 'Apps and sessions',
        body: 'See information about when you logged into your account and the apps you connected.',
        href: '/settings/apps_and_sessions',
        icon: 'external',
      },
    ],
  },
  {
    title: 'Privacy and safety',
    items: [
      {
        title: 'Audience and tagging',
        body: 'Manage what information you allow other people on Twitter to see.',
        href: '/settings/privacy_and_safety',
        icon: 'lock',
      },
      { title: 'Direct Messages', href: '/settings/messages', icon: 'mail' },
      { title: 'Mute and block', href: '/settings/mute_and_block', icon: 'warning' },
      { title: 'Content you see', href: '/settings/content_preferences', icon: 'eye' },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { title: 'Filters', href: '/settings/notifications', icon: 'bell' },
      { title: 'Preferences', href: '/settings/email_notifications', icon: 'settings' },
    ],
  },
  {
    title: 'General',
    items: [
      {
        title: 'Display',
        body: 'Manage your font size, color, and background.',
        href: '/settings/display',
        icon: 'sparkle',
      },
      { title: 'Accessibility', href: '/settings/accessibility', icon: 'people' },
      { title: 'Data usage', href: '/settings/data', icon: 'globe' },
      { title: 'About Twitter', href: '/settings/about', icon: 'bird' },
    ],
  },
];

export function SettingsScreen() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !normalizedQuery ||
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.body?.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <div className="settings-search">
        <Icon name="search" size={20} />
        <input
          placeholder="Search settings"
          aria-label="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {visibleGroups.map((group) => (
        <section className="settings-group" key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => (
            <SettingLink key={item.href} item={item} />
          ))}
        </section>
      ))}
      {visibleGroups.length === 0 && (
        <EmptyState
          icon="search"
          title="No settings found"
          body="Try searching for another setting."
        />
      )}
    </AppShell>
  );
}

function SettingLink({ item }: { item: SettingsItem }) {
  return (
    <Link className="setting-link" href={item.href}>
      {item.icon && <Icon name={item.icon} size={21} />}
      <span>
        <strong>{item.title}</strong>
        {item.body && <small>{item.body}</small>}
      </span>
      <Icon name="chevron" size={18} />
    </Link>
  );
}

const accents: Array<{ name: AccentName; hex: string; label: string }> = [
  { name: 'blue', hex: '#1DA1F2', label: 'Blue' },
  { name: 'yellow', hex: '#FFAD1F', label: 'Yellow' },
  { name: 'pink', hex: '#E0245E', label: 'Pink' },
  { name: 'purple', hex: '#794BC4', label: 'Purple' },
  { name: 'orange', hex: '#F45D22', label: 'Orange' },
  { name: 'green', hex: '#17BF63', label: 'Green' },
];
const fonts: Array<{ name: FontSizeName; size: number }> = [
  { name: 'small', size: 12 },
  { name: 'default', size: 14 },
  { name: 'large', size: 17 },
  { name: 'xlarge', size: 20 },
];
const backgrounds: Array<{ name: ThemeName; label: string; hex: string }> = [
  { name: 'light', label: 'Default', hex: '#ffffff' },
  { name: 'dim', label: 'Dim', hex: '#15202b' },
  { name: 'lights-out', label: 'Lights out', hex: '#000000' },
];

type SettingsPayload = {
  theme?: ThemeName;
  accentColor?: AccentName;
  fontSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  reduceMotion?: boolean;
  autoplayVideo?: boolean;
  showSensitiveMedia?: boolean;
  discoverableByEmail?: boolean;
  allowDirectMessagesFrom?: 'everyone' | 'following';
  defaultTimeline?: 'top' | 'latest';
  protectedAccount?: boolean;
  allowPhotoTagging?: boolean;
  showReadReceipts?: boolean;
  notifications?: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    likes?: boolean;
    retweets?: boolean;
    follows?: boolean;
    mentions?: boolean;
    directMessages?: boolean;
  };
};

export function DisplaySettingsScreen() {
  const { theme, accent, fontSize, setTheme, setAccent, setFontSize } = useTheme();
  const { viewer } = useSession();
  useEffect(() => {
    void apiFetch<SettingsPayload>('/api/v1/settings')
      .then((settings) => {
        if (settings.theme) setTheme(settings.theme);
        if (settings.accentColor) setAccent(settings.accentColor);
        if (settings.fontSize) {
          setFontSize(
            ({ xs: 'small', sm: 'small', md: 'default', lg: 'large', xl: 'xlarge' } as const)[
              settings.fontSize
            ],
          );
        }
      })
      .catch(() => undefined);
  }, [setAccent, setFontSize, setTheme]);
  const chooseTheme = (value: ThemeName) => {
    setTheme(value);
    void apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ theme: value }) });
  };
  const chooseAccent = (value: AccentName) => {
    setAccent(value);
    void apiFetch('/api/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify({ accentColor: value }),
    });
  };
  const chooseFont = (value: FontSizeName) => {
    setFontSize(value);
    const backendValue = ({ small: 'sm', default: 'md', large: 'lg', xlarge: 'xl' } as const)[
      value
    ];
    void apiFetch('/api/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify({ fontSize: backendValue }),
    });
  };
  return (
    <AppShell>
      <PageHeader title="Display" back />
      <div className="display-intro">
        <h2>Customize your view</h2>
        <p>
          Manage your font size, color, and background. These settings affect all the Twitter
          accounts on this browser.
        </p>
      </div>
      <div className="display-preview">
        <Avatar user={viewer} size={48} />
        <div>
          <div>
            <strong>{viewer?.name || 'Your account'}</strong>
            {viewer?.verified && <VerifiedBadge />}
            <span>@{viewer?.handle || 'username'} · now</span>
          </div>
          <p>This is how your Tweets will look with these display settings.</p>
          <div className="preview-actions">
            <Icon name="reply" size={18} />
            <Icon name="retweet" size={18} />
            <Icon name="heart" size={18} />
            <Icon name="share" size={18} />
          </div>
        </div>
      </div>
      <section className="display-setting">
        <h3>Font size</h3>
        <div className="font-size-control">
          <span>Aa</span>
          {fonts.map((font) => (
            <button
              key={font.name}
              className={fontSize === font.name ? 'active' : ''}
              onClick={() => chooseFont(font.name)}
              aria-label={`${font.name} font size`}
            >
              <span style={{ width: font.size, height: font.size }} />
            </button>
          ))}
          <span className="large-aa">Aa</span>
        </div>
      </section>
      <section className="display-setting">
        <h3>Color</h3>
        <div className="accent-grid">
          {accents.map((item) => (
            <button
              key={item.name}
              style={{ background: item.hex }}
              className={accent === item.name ? 'active' : ''}
              onClick={() => chooseAccent(item.name)}
              aria-label={item.label}
            >
              {accent === item.name && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      </section>
      <section className="display-setting">
        <h3>Background</h3>
        <div className="background-grid">
          {backgrounds.map((item) => (
            <button
              key={item.name}
              style={{ background: item.hex, color: item.name === 'light' ? '#0f1419' : '#fff' }}
              className={theme === item.name ? 'active' : ''}
              onClick={() => chooseTheme(item.name)}
            >
              <span>{theme === item.name && <Icon name="check" size={14} />}</span>
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

type SectionConfig = {
  title: string;
  description?: string;
  rows: Array<{
    key: string;
    title: string;
    body?: string;
    kind?: 'toggle' | 'link' | 'action';
    danger?: boolean;
    disabled?: boolean;
  }>;
};
const sections: Record<string, SectionConfig> = {
  account: {
    title: 'Account information',
    description: 'See information about your account.',
    rows: [
      { key: 'username', title: 'Username', kind: 'link' },
      { key: 'email', title: 'Email', kind: 'link' },
      { key: 'country', title: 'Country', kind: 'link' },
      { key: 'account_creation', title: 'Account creation', kind: 'link' },
    ],
  },
  security: {
    title: 'Security',
    rows: [
      {
        key: 'two_factor',
        title: 'Two-factor authentication',
        body: 'Use a second authentication method in addition to your password.',
        kind: 'link',
      },
      { key: 'password_reset', title: 'Reset your password', kind: 'link' },
    ],
  },
  privacy_and_safety: {
    title: 'Audience and tagging',
    rows: [
      {
        key: 'protected',
        title: 'Protect your Tweets',
        body: 'Only show your Tweets to people who follow you.',
        kind: 'toggle',
      },
      {
        key: 'photo_tagging',
        title: 'Photo tagging',
        body: 'Allow anyone to tag you in photos.',
        kind: 'toggle',
        disabled: true,
      },
      {
        key: 'discoverable_email',
        title: 'Let people who have your email address find you',
        kind: 'toggle',
      },
    ],
  },
  messages: {
    title: 'Direct Messages',
    rows: [
      {
        key: 'dm_everyone',
        title: 'Receive messages from anyone',
        body: 'You will be able to receive Direct Message requests from anyone on Twitter.',
        kind: 'toggle',
      },
      {
        key: 'read_receipts',
        title: 'Show read receipts',
        body: 'Let people you’re messaging with know when you’ve seen their messages.',
        kind: 'toggle',
      },
    ],
  },
  notifications: {
    title: 'Notifications',
    rows: [
      {
        key: 'quality_filter',
        title: 'Quality filter',
        body: 'Filter lower-quality content from your notifications.',
        kind: 'toggle',
        disabled: true,
      },
      {
        key: 'advanced_filters',
        title: 'Advanced filters',
        body: 'Filter notifications from specific types of accounts.',
        kind: 'link',
        disabled: true,
      },
      { key: 'muted_notifications', title: 'Muted notifications', kind: 'link' },
    ],
  },
  email_notifications: {
    title: 'Notification preferences',
    rows: [
      {
        key: 'email_notifications',
        title: 'Email notifications',
        body: 'Get emails to find out what’s going on when you’re not on Twitter.',
        kind: 'toggle',
      },
      { key: 'likes_notifications', title: 'Likes', kind: 'toggle' },
      { key: 'retweet_notifications', title: 'Retweets and Quotes', kind: 'toggle' },
      { key: 'follow_notifications', title: 'New followers', kind: 'toggle' },
      { key: 'mention_notifications', title: 'Mentions and replies', kind: 'toggle' },
      { key: 'direct_messages', title: 'Direct Messages', kind: 'toggle' },
    ],
  },
  accessibility: {
    title: 'Accessibility',
    rows: [
      {
        key: 'reduce_motion',
        title: 'Reduce motion',
        body: 'Limits the amount of in-app animations.',
        kind: 'toggle',
      },
      {
        key: 'image_descriptions',
        title: 'Compose image descriptions',
        body: 'Add the ability to describe images for people who are visually impaired.',
        kind: 'toggle',
        disabled: true,
      },
    ],
  },
  content_preferences: {
    title: 'Content you see',
    rows: [
      { key: 'topics', title: 'Topics', kind: 'link' },
      { key: 'interests', title: 'Interests', kind: 'link' },
      { key: 'explore_location', title: 'Explore settings', kind: 'link' },
      { key: 'search_settings', title: 'Search settings', kind: 'link' },
    ],
  },
  search_settings: {
    title: 'Search settings',
    description: 'Control the content that appears in your search results.',
    rows: [
      {
        key: 'show_sensitive_media',
        title: 'Display media that may contain sensitive content',
        kind: 'toggle',
      },
    ],
  },
  trends: {
    title: 'Explore settings',
    rows: [
      {
        key: 'trends_location',
        title: 'Show content in this location',
        body: 'When this is on, you’ll see what’s happening around you right now.',
        kind: 'toggle',
        disabled: true,
      },
      { key: 'location', title: 'Explore locations', kind: 'link', disabled: true },
    ],
  },
  data: {
    title: 'Data usage',
    rows: [
      {
        key: 'autoplay_video',
        title: 'Video autoplay',
        body: 'Automatically play videos and GIFs in timelines.',
        kind: 'toggle',
      },
    ],
  },
  download_data: {
    title: 'Download an archive of your data',
    description: 'Get insights into the type of information stored for your account.',
    rows: [
      {
        key: 'request_archive',
        title: 'Request archive',
        body: 'We’ll notify you when a ZIP file of your Twitter data is ready to download.',
        kind: 'action',
      },
    ],
  },
  deactivate: {
    title: 'Deactivate account',
    description:
      'This will deactivate your account. Your display name, @username, and public profile will no longer be viewable on Twitter.',
    rows: [
      {
        key: 'deactivate',
        title: 'Deactivate',
        body: 'You can restore your account for up to 30 days after deactivation.',
        kind: 'action',
        danger: true,
      },
    ],
  },
};

function settingValue(settings: SettingsPayload | null, key: string): boolean {
  if (!settings) return false;
  if (key === 'reduce_motion') return Boolean(settings.reduceMotion);
  if (key === 'discoverable_email') return Boolean(settings.discoverableByEmail);
  if (key === 'dm_everyone') return settings.allowDirectMessagesFrom === 'everyone';
  if (key === 'email_notifications') return Boolean(settings.notifications?.emailEnabled);
  if (key === 'likes_notifications') return Boolean(settings.notifications?.likes);
  if (key === 'retweet_notifications') return Boolean(settings.notifications?.retweets);
  if (key === 'follow_notifications') return Boolean(settings.notifications?.follows);
  if (key === 'mention_notifications') return Boolean(settings.notifications?.mentions);
  if (key === 'direct_messages') return Boolean(settings.notifications?.directMessages);
  if (key === 'protected') return Boolean(settings.protectedAccount);
  if (key === 'photo_tagging') return Boolean(settings.allowPhotoTagging);
  if (key === 'read_receipts') return Boolean(settings.showReadReceipts);
  if (key === 'show_sensitive_media') return Boolean(settings.showSensitiveMedia);
  if (key === 'autoplay_video') return Boolean(settings.autoplayVideo);
  return false;
}

function settingPatch(key: string, value: boolean): Record<string, unknown> {
  if (key === 'reduce_motion') return { reduceMotion: value };
  if (key === 'discoverable_email') return { discoverableByEmail: value };
  if (key === 'dm_everyone') return { allowDirectMessagesFrom: value ? 'everyone' : 'following' };
  if (key === 'email_notifications') return { notifications: { emailEnabled: value } };
  if (key === 'likes_notifications') return { notifications: { likes: value } };
  if (key === 'retweet_notifications') return { notifications: { retweets: value } };
  if (key === 'follow_notifications') return { notifications: { follows: value } };
  if (key === 'mention_notifications') return { notifications: { mentions: value } };
  if (key === 'direct_messages') return { notifications: { directMessages: value } };
  if (key === 'protected') return { protectedAccount: value };
  if (key === 'photo_tagging') return { allowPhotoTagging: value };
  if (key === 'read_receipts') return { showReadReceipts: value };
  if (key === 'show_sensitive_media') return { showSensitiveMedia: value };
  if (key === 'autoplay_video') return { autoplayVideo: value };
  return {};
}

export function SettingsSectionScreen({ section }: { section: string }) {
  if (section === 'two_factor') return <TwoFactorSettingsScreen />;
  if (section === 'password') return <ChangePasswordSettingsScreen />;
  if (section === 'apps_and_sessions') return <SessionsSettingsScreen />;
  if (section === 'mute_and_block') return <MuteBlockSettingsScreen />;
  if (section === 'download_data') return <ArchiveSettingsScreen />;
  if (section === 'account') return <AccountInformationScreen />;
  if (section === 'about') return <AboutSettingsScreen />;
  return <SettingsSectionBody section={section} />;
}

type ArchiveExport = {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'expired' | 'failed';
  requestedAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  downloadUrl?: string | null;
  error?: string | null;
};

function ArchiveSettingsScreen() {
  const { data, loading, error, reload } = useApi<ArchiveExport | null>('/api/v1/settings/archive');
  const { showToast } = useToast();
  const [latest, setLatest] = useState<ArchiveExport | null>(null);
  const [requesting, setRequesting] = useState(false);
  const archive = latest && (!data || data.id !== latest.id) ? latest : (data ?? latest);
  const building = archive?.status === 'pending' || archive?.status === 'processing';

  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => reload(), 3_000);
    return () => window.clearInterval(timer);
  }, [building, reload]);

  const requestArchive = async () => {
    if (requesting || building) return;
    setRequesting(true);
    try {
      const result = await apiFetch<ArchiveExport>('/api/v1/settings/archive', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setLatest(result);
      showToast('Your archive request was received.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your archive request could not start.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Download an archive of your data" back />
      <p className="settings-description">
        Get a ZIP file containing your account information, Tweets, Lists, and Messages.
      </p>
      {loading && !archive && (
        <div className="settings-loading">
          <Spinner />
        </div>
      )}
      {error && !archive && <ErrorState message={error} retry={reload} />}
      {!loading && !error && !archive && (
        <section className="archive-panel">
          <Icon name="external" size={30} />
          <h2>Request your archive</h2>
          <p>We&apos;ll prepare your data in the background and make it available here.</p>
          <button
            className="button button-primary"
            disabled={requesting}
            onClick={() => void requestArchive()}
          >
            {requesting ? <Spinner /> : 'Request archive'}
          </button>
        </section>
      )}
      {archive && (
        <section className="archive-panel">
          <div className={`archive-status ${archive.status}`}>
            <Icon
              name={
                archive.status === 'ready'
                  ? 'check'
                  : archive.status === 'failed'
                    ? 'warning'
                    : 'external'
              }
              size={25}
            />
            <span>
              <strong>
                {archive.status === 'ready'
                  ? 'Your archive is ready'
                  : archive.status === 'failed'
                    ? 'Your archive could not be created'
                    : archive.status === 'expired'
                      ? 'This archive has expired'
                      : 'We are preparing your archive'}
              </strong>
              <small>
                Requested {new Date(archive.requestedAt).toLocaleString()}
                {building ? ' · This page updates automatically.' : ''}
              </small>
            </span>
            {building && <Spinner />}
          </div>
          {archive.error && <p className="settings-inline-error">{archive.error}</p>}
          {archive.status === 'ready' && archive.downloadUrl ? (
            <a className="button button-primary" href={archive.downloadUrl} download>
              Download ZIP
            </a>
          ) : archive.status === 'failed' || archive.status === 'expired' ? (
            <button
              className="button button-primary"
              disabled={requesting}
              onClick={() => void requestArchive()}
            >
              {requesting ? <Spinner /> : 'Request a new archive'}
            </button>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

type ModeratedAccountsPayload = { items?: unknown[] };

function MuteBlockSettingsScreen() {
  const [tab, setTab] = useState<'blocked' | 'muted'>('blocked');
  const { data, loading, error, reload } = useApi<ModeratedAccountsPayload>(
    `/api/v1/settings/${tab}`,
  );
  const { showToast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);
  const users: User[] = Array.isArray(data?.items) ? data.items.map(normalizeUser) : [];

  const remove = async (user: User) => {
    setUpdating(user.id);
    try {
      await apiFetch(
        `/api/v1/users/${encodeURIComponent(user.handle)}/${tab === 'blocked' ? 'block' : 'mute'}`,
        { method: 'DELETE' },
      );
      reload();
      showToast(`@${user.handle} was ${tab === 'blocked' ? 'unblocked' : 'unmuted'}.`);
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : `That account could not be ${tab === 'blocked' ? 'unblocked' : 'unmuted'}.`,
      );
    } finally {
      setUpdating(null);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Mute and block" back />
      <div className="settings-tabs" role="tablist" aria-label="Mute and block settings">
        <button
          role="tab"
          aria-selected={tab === 'blocked'}
          className={tab === 'blocked' ? 'active' : ''}
          onClick={() => setTab('blocked')}
        >
          Blocked accounts
        </button>
        <button
          role="tab"
          aria-selected={tab === 'muted'}
          className={tab === 'muted' ? 'active' : ''}
          onClick={() => setTab('muted')}
        >
          Muted accounts
        </button>
      </div>
      <p className="settings-description">
        {tab === 'blocked'
          ? 'Blocked accounts cannot follow, message, or interact with you.'
          : 'Tweets from muted accounts will not appear in your Home timeline.'}
      </p>
      {loading && (
        <div className="settings-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && users.length === 0 && (
        <EmptyState
          icon={tab === 'blocked' ? 'warning' : 'bell'}
          title={`You aren't ${tab === 'blocked' ? 'blocking' : 'muting'} anyone`}
          body={
            tab === 'blocked'
              ? 'When you block someone, they will show up here.'
              : 'When you mute someone, they will show up here.'
          }
        />
      )}
      {!loading && !error && users.length > 0 && (
        <section className="section-settings">
          {users.map((user) => (
            <div className="settings-row moderation-account-row" key={user.id}>
              <Link className="moderation-account-link" href={`/${user.handle}`}>
                <Avatar user={user} size={48} />
                <span>
                  <strong>
                    {user.name}
                    {user.verified && <VerifiedBadge />}
                  </strong>
                  <small>@{user.handle}</small>
                </span>
              </Link>
              <button
                className="button"
                disabled={updating === user.id}
                onClick={() => void remove(user)}
              >
                {updating === user.id ? <Spinner /> : tab === 'blocked' ? 'Unblock' : 'Unmute'}
              </button>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}

function AccountInformationScreen() {
  const { viewer, refresh } = useSession();
  const { showToast } = useToast();
  const [handleDraft, setHandleDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<'handle' | 'email' | null>(null);
  const handle = handleDraft ?? viewer?.handle ?? '';
  const email = emailDraft ?? viewer?.email ?? '';
  const handleValid = /^[A-Za-z0-9_]{1,15}$/.test(handle);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const saveHandle = async () => {
    if (!handleValid || saving) return;
    setSaving('handle');
    try {
      await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ handle }),
      });
      await refresh();
      showToast('Your username was updated.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your username could not be updated.');
    } finally {
      setSaving(null);
    }
  };

  const saveEmail = async () => {
    if (!emailValid || saving || email === viewer?.email) return;
    setSaving('email');
    try {
      await apiFetch('/api/auth/change-email', {
        method: 'POST',
        body: JSON.stringify({
          newEmail: email,
          callbackURL: `${window.location.origin}/settings/account`,
        }),
      });
      showToast('Check your new email address to confirm the change.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your email could not be changed.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Account information" back />
      <p className="settings-description">Review and update the information on your account.</p>
      <section className="account-edit-section">
        <label className="settings-field">
          Username
          <div className="account-edit-control">
            <span aria-hidden="true">@</span>
            <input
              value={handle}
              maxLength={15}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => setHandleDraft(event.target.value.replace(/^@/, ''))}
            />
          </div>
          <small>Usernames can use letters, numbers, and underscores.</small>
        </label>
        <button
          className="button"
          disabled={!handleValid || handle === viewer?.handle || saving !== null}
          onClick={() => void saveHandle()}
        >
          {saving === 'handle' ? <Spinner /> : 'Save username'}
        </button>
        <label className="settings-field">
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmailDraft(event.target.value)}
          />
          <small>A confirmation link will be sent to the new address.</small>
        </label>
        <button
          className="button"
          disabled={!emailValid || email === viewer?.email || saving !== null}
          onClick={() => void saveEmail()}
        >
          {saving === 'email' ? <Spinner /> : 'Change email'}
        </button>
        <div className="account-created">
          <strong>Account creation</strong>
          <small>
            {viewer?.createdAt ? new Date(viewer.createdAt).toLocaleString() : 'Not available'}
          </small>
        </div>
      </section>
    </AppShell>
  );
}

function ChangePasswordSettingsScreen() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const valid =
    currentPassword.length >= 8 && newPassword.length >= 8 && newPassword === confirmation;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      showToast('Your password was changed. Other sessions were logged out.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Your password could not be changed.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <AppShell>
      <PageHeader title="Change password" back />
      <form className="two-factor-panel" onSubmit={submit}>
        <p>Choose a strong password you don&apos;t use on other websites.</p>
        <label className="settings-field">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label className="settings-field">
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {confirmation && newPassword !== confirmation && (
          <span className="settings-inline-error">Passwords do not match.</span>
        )}
        <button className="button button-primary" disabled={!valid || saving}>
          {saving ? <Spinner /> : 'Save'}
        </button>
      </form>
    </AppShell>
  );
}

type SessionEntry = {
  id: string;
  current?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
  expiresAt?: string;
};

function SessionsSettingsScreen() {
  const { data, loading, error, reload } = useApi<unknown>('/api/v1/settings/sessions');
  const { showToast } = useToast();
  const [revoking, setRevoking] = useState<string | null>(null);
  const source = data && typeof data === 'object' ? (data as { items?: SessionEntry[] }) : {};
  const sessions = Array.isArray(source.items) ? source.items : [];
  const revoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await apiFetch('/api/v1/settings/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId }),
      });
      reload();
      showToast('That session was logged out.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That session could not be removed.');
    } finally {
      setRevoking(null);
    }
  };
  return (
    <AppShell>
      <PageHeader title="Apps and sessions" back />
      <p className="settings-description">
        Review the browsers and devices currently signed in to your account.
      </p>
      {loading && (
        <div className="settings-loading">
          <Spinner />
        </div>
      )}
      {error && <ErrorState message={error} retry={reload} />}
      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          icon="lock"
          title="No other sessions"
          body="Your active sessions will appear here."
        />
      )}
      <section className="section-settings">
        {sessions.map((session) => (
          <div className="settings-row session-row" key={session.id}>
            <Icon name="globe" size={21} />
            <span>
              <strong>{session.userAgent || 'Browser session'}</strong>
              <small>
                {[
                  session.ipAddress,
                  session.createdAt ? new Date(session.createdAt).toLocaleString() : null,
                  session.current ? 'Active now' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
            <button
              className="button"
              disabled={session.current || revoking === session.id}
              onClick={() => void revoke(session.id)}
            >
              {session.current ? 'This device' : revoking === session.id ? <Spinner /> : 'Log out'}
            </button>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function AboutSettingsScreen() {
  const links = [
    ['About Twitter', 'https://about.twitter.com/'],
    ['Help Center', 'https://help.twitter.com/'],
    ['Terms of Service', 'https://twitter.com/tos'],
    ['Privacy Policy', 'https://twitter.com/privacy'],
    ['Cookie Policy', 'https://help.twitter.com/rules-and-policies/twitter-cookies'],
  ] as const;
  return (
    <AppShell>
      <PageHeader title="About Twitter" back />
      <section className="section-settings">
        {links.map(([title, href]) => (
          <a className="settings-row" href={href} target="_blank" rel="noreferrer" key={href}>
            <span>
              <strong>{title}</strong>
            </span>
            <Icon name="external" size={18} />
          </a>
        ))}
      </section>
    </AppShell>
  );
}

function TwoFactorSettingsScreen() {
  const { viewer, refresh } = useSession();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [replacementCodes, setReplacementCodes] = useState<string[] | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  let secret = '';
  if (setup) {
    try {
      secret = new URL(setup.totpURI).searchParams.get('secret') || '';
    } catch {
      secret = '';
    }
  }

  const beginSetup = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ totpURI: string; backupCodes: string[] }>(
        '/api/auth/two-factor/enable',
        { method: 'POST', body: JSON.stringify({ password }) },
      );
      setSetup(result);
      setPassword('');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Two-factor setup could not start.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    try {
      await apiFetch('/api/auth/two-factor/verify-totp', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setCompleted(true);
      setCode('');
      await refresh();
      showToast('Two-factor authentication is now on.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That authentication code is invalid.');
    } finally {
      setBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      await apiFetch('/api/auth/two-factor/disable', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setSetup(null);
      setCompleted(false);
      await refresh();
      showToast('Two-factor authentication is now off.');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Two-factor authentication stayed on.');
    } finally {
      setBusy(false);
    }
  };

  const generateBackupCodes = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ backupCodes: string[] }>(
        '/api/auth/two-factor/generate-backup-codes',
        { method: 'POST', body: JSON.stringify({ password }) },
      );
      setReplacementCodes(result.backupCodes);
      setPassword('');
      showToast('New backup codes created. Your previous codes no longer work.');
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : 'New backup codes could not be created.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Two-factor authentication" back />
      <section className="two-factor-panel">
        {completed && setup ? (
          <>
            <div className="two-factor-status success">
              <Icon name="check" size={21} />
              <span>
                <strong>You&apos;re all set</strong>
                <small>Save these one-time backup codes somewhere safe.</small>
              </span>
            </div>
            <div className="backup-code-grid" aria-label="Backup codes">
              {setup.backupCodes.map((backupCode) => (
                <code key={backupCode}>{backupCode}</code>
              ))}
            </div>
            <Link className="button button-primary" href="/settings/security">
              Done
            </Link>
          </>
        ) : viewer?.twoFactorEnabled && replacementCodes ? (
          <>
            <div className="two-factor-status success">
              <Icon name="check" size={21} />
              <span>
                <strong>Your backup codes were replaced</strong>
                <small>Save these codes now. Your previous backup codes no longer work.</small>
              </span>
            </div>
            <div className="backup-code-grid" aria-label="New backup codes">
              {replacementCodes.map((backupCode) => (
                <code key={backupCode}>{backupCode}</code>
              ))}
            </div>
            <button className="button button-primary" onClick={() => setReplacementCodes(null)}>
              Done
            </button>
          </>
        ) : viewer?.twoFactorEnabled ? (
          <>
            <div className="two-factor-status success">
              <Icon name="lock" size={22} />
              <span>
                <strong>Two-factor authentication is on</strong>
                <small>Your authenticator app is required when you sign in.</small>
              </span>
            </div>
            <label className="settings-field">
              Confirm your password to manage two-factor authentication
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="two-factor-actions">
              <button
                className="button"
                disabled={!password || busy}
                onClick={() => void generateBackupCodes()}
              >
                {busy ? <Spinner /> : 'Get new backup codes'}
              </button>
              <button
                className="button button-danger"
                disabled={!password || busy}
                onClick={() => void disableTwoFactor()}
              >
                Turn off
              </button>
            </div>
          </>
        ) : setup ? (
          <>
            <h2>Connect your authenticator app</h2>
            <p>
              Add a new account in your authenticator app, then enter the six-digit code it shows.
            </p>
            <div className="totp-secret">
              <span>Setup key</span>
              <code>{secret || setup.totpURI}</code>
              <button
                className="button"
                onClick={() => {
                  void navigator.clipboard.writeText(secret || setup.totpURI);
                  showToast('Setup key copied.');
                }}
              >
                Copy
              </button>
            </div>
            <label className="settings-field">
              Authentication code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!/^\d{6}$/.test(code) || busy}
              onClick={() => void verifyCode()}
            >
              {busy ? <Spinner /> : 'Verify'}
            </button>
          </>
        ) : (
          <>
            <div className="two-factor-hero">
              <Icon name="lock" size={34} />
              <h2>Protect your account</h2>
              <p>Use a time-based code from an authenticator app in addition to your password.</p>
            </div>
            <label className="settings-field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!password || busy}
              onClick={() => void beginSetup()}
            >
              {busy ? <Spinner /> : 'Get started'}
            </button>
          </>
        )}
      </section>
    </AppShell>
  );
}

function SettingsSectionBody({ section }: { section: string }) {
  const config = sections[section] || {
    title: section
      .split('_')
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(' '),
    rows: [],
  };
  const { showToast } = useToast();
  const { setAutoplayVideo } = useTheme();
  const { data: settings } = useApi<SettingsPayload>('/api/v1/settings');
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivateConfirmation, setDeactivateConfirmation] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [reduceMotionPreview, setReduceMotionPreview] = useState<boolean | null>(null);
  useEffect(() => {
    if (reduceMotionPreview === null) return;
    localStorage.setItem('twitter-reduce-motion', String(reduceMotionPreview));
    document.documentElement.dataset.reduceMotion = String(reduceMotionPreview);
  }, [reduceMotionPreview]);
  const setToggle = async (key: string, value: boolean) => {
    setToggles((current) => ({ ...current, [key]: value }));
    if (key === 'reduce_motion') setReduceMotionPreview(value);
    if (key === 'autoplay_video') setAutoplayVideo(value);
    try {
      const payload = settingPatch(key, value);
      await apiFetch('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch (reason) {
      setToggles((current) => ({ ...current, [key]: !value }));
      if (key === 'reduce_motion') setReduceMotionPreview(!value);
      if (key === 'autoplay_video') setAutoplayVideo(!value);
      showToast(reason instanceof Error ? reason.message : 'Your setting couldn’t be saved.');
    }
  };
  const performAction = async (key: string) => {
    if (key === 'request_archive') {
      try {
        await apiFetch('/api/v1/settings/archive', { method: 'POST', body: JSON.stringify({}) });
        showToast('Your archive request was received.');
      } catch (reason) {
        showToast(
          reason instanceof Error ? reason.message : 'Your archive request could not be created.',
        );
      }
      return;
    }
    if (key === 'deactivate') setDeactivateOpen(true);
  };
  const deactivate = async () => {
    setDeactivating(true);
    try {
      await apiFetch('/api/v1/settings/deactivate', {
        method: 'POST',
        body: JSON.stringify({
          password: deactivatePassword,
          confirmation: deactivateConfirmation,
        }),
      });
      sessionStorage.removeItem('twitter-pending-onboarding');
      window.location.assign('/');
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : 'Your account could not be deactivated.',
      );
      setDeactivating(false);
    }
  };
  if (!config.rows.length)
    return (
      <AppShell>
        <PageHeader title={config.title} back />
        <EmptyState
          icon="settings"
          title={config.title}
          body="There are no additional settings on this page."
        />
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeader title={config.title} back />
      {config.description && <p className="settings-description">{config.description}</p>}
      <section className="section-settings">
        {config.rows.map((row) => {
          const label = (
            <span>
              <strong>{row.title}</strong>
              {row.body && <small>{row.body}</small>}
            </span>
          );
          if (row.kind === 'link' && !row.disabled) {
            const href =
              row.key === 'topics'
                ? '/i/topics'
                : row.key === 'interests'
                  ? '/i/topics'
                  : row.key === 'muted_notifications'
                    ? '/settings/mute_and_block'
                    : row.key === 'password_reset'
                      ? '/account/begin_password_reset'
                      : row.key === 'explore_location'
                        ? '/settings/trends'
                        : `/settings/${row.key}`;
            return (
              <Link className="settings-row" href={href} key={row.key}>
                {label}
                <Icon name="chevron" size={18} />
              </Link>
            );
          }
          return (
            <div className={`settings-row ${row.danger ? 'danger' : ''}`} key={row.key}>
              {label}
              {row.disabled ? (
                <span className="setting-unavailable">Unavailable</span>
              ) : row.kind === 'toggle' ? (
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={toggles[row.key] ?? settingValue(settings, row.key)}
                    onChange={(event) => void setToggle(row.key, event.target.checked)}
                  />
                  <span />
                </label>
              ) : (
                <button
                  className={`button ${row.danger ? 'button-danger' : ''}`}
                  onClick={() => void performAction(row.key)}
                >
                  {row.title}
                </button>
              )}
            </div>
          );
        })}
      </section>
      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title="Deactivate account"
        className="deactivate-modal"
      >
        <div className="deactivate-modal-body">
          <div className="deactivate-modal-icon">
            <Icon name="warning" size={30} />
          </div>
          <h2>Deactivate your account?</h2>
          <p>
            Your profile and Tweets will no longer be visible. You can restore your account by
            logging in within 30 days.
          </p>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={deactivatePassword}
              onChange={(event) => setDeactivatePassword(event.target.value)}
            />
          </label>
          <label>
            Type <strong>DEACTIVATE</strong> to confirm
            <input
              value={deactivateConfirmation}
              onChange={(event) => setDeactivateConfirmation(event.target.value)}
            />
          </label>
          <div>
            <button className="button" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={
                !deactivatePassword || deactivateConfirmation !== 'DEACTIVATE' || deactivating
              }
              onClick={() => void deactivate()}
            >
              {deactivating ? <Spinner /> : 'Deactivate'}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
