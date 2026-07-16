'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { Avatar, Modal, Skeleton } from '@/components/ui/primitives';
import { useSession } from '@/components/providers/app-providers';
import { apiFetch, useApi } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { TweetComposer } from '@/components/timeline/tweet-composer';
import { RightSidebar } from './right-sidebar';
import '@/styles/shell.css';

type NavItem = { label: string; icon: IconName; href: string; match?: (path: string) => boolean };

const baseNav: NavItem[] = [
  { label: 'Home', icon: 'home', href: '/home' },
  {
    label: 'Explore',
    icon: 'explore',
    href: '/explore',
    match: (path) => path === '/explore' || path.startsWith('/search'),
  },
  {
    label: 'Notifications',
    icon: 'bell',
    href: '/notifications',
    match: (path) => path.startsWith('/notifications'),
  },
  {
    label: 'Messages',
    icon: 'mail',
    href: '/messages',
    match: (path) => path.startsWith('/messages'),
  },
  { label: 'Bookmarks', icon: 'bookmark', href: '/i/bookmarks' },
  { label: 'Lists', icon: 'list', href: '/i/lists', match: (path) => path.startsWith('/i/lists') },
];

export function AppShell({
  children,
  hideRightSidebar = false,
  wide = false,
  publicAccess = false,
}: {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
  wide?: boolean;
  publicAccess?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { viewer, loading, signOut } = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openCompose = useCallback(() => setComposeOpen(true), []);
  useEffect(() => {
    const onCompose = () => setComposeOpen(true);
    window.addEventListener('twitter:compose', onCompose);
    return () => window.removeEventListener('twitter:compose', onCompose);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === 'Escape') {
        setMoreOpen(false);
        setAccountOpen(false);
      }
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openCompose();
      }
      if (event.key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('#global-search')?.focus();
      }
      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (event.key === 'j' || event.key === 'k') {
        const cards = [...document.querySelectorAll<HTMLElement>('[data-tweet-card]')];
        if (!cards.length) return;
        const current = cards.findIndex(
          (card) => card === document.activeElement || card.contains(document.activeElement),
        );
        const next =
          event.key === 'j'
            ? Math.min(cards.length - 1, current + 1)
            : Math.max(0, current <= 0 ? 0 : current - 1);
        cards[next]?.focus();
      }
      const routes: Record<string, string> = { g: '/home' };
      const targetRoute = routes[event.key];
      if (targetRoute) router.push(targetRoute);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openCompose, router]);

  const navItems = useMemo(
    () => [
      ...baseNav,
      {
        label: 'Profile',
        icon: 'user' as IconName,
        href: viewer?.handle ? `/${viewer.handle}` : '/settings/profile',
      },
    ],
    [viewer?.handle],
  );

  useEffect(() => {
    if (!loading && viewer && !viewer.handle) router.replace('/i/flow/onboarding');
  }, [loading, router, viewer]);

  const skeletonVariant: ShellSkeletonVariant =
    pathname === '/explore'
      ? 'explore'
      : pathname.startsWith('/messages/')
        ? 'message-detail'
        : pathname === '/messages'
          ? 'messages'
          : 'timeline';

  if (loading)
    return (
      <ShellSkeleton hideRightSidebar={hideRightSidebar} wide={wide} variant={skeletonVariant} />
    );
  if (!viewer)
    return publicAccess ? (
      <GuestShell hideRightSidebar={hideRightSidebar} wide={wide}>
        {children}
      </GuestShell>
    ) : (
      <AccessGate />
    );
  if (!viewer.handle)
    return (
      <ShellSkeleton hideRightSidebar={hideRightSidebar} wide={wide} variant={skeletonVariant} />
    );

  const isActive = (item: NavItem) => (item.match ? item.match(pathname) : pathname === item.href);

  return (
    <div
      className={`app-frame ${hideRightSidebar ? 'app-frame-two-column' : ''} ${wide ? 'app-frame-wide' : ''}`}
    >
      <header className="primary-rail" aria-label="Primary">
        <div className="primary-rail-inner">
          <Link href="/home" className="brand-button" aria-label="Twitter home">
            <Icon name="bird" size={29} />
          </Link>
          <nav className="primary-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link ${isActive(item) ? 'nav-link-active' : ''}`}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                <Icon name={item.icon} size={26} active={isActive(item)} />
                <span>{item.label}</span>
              </Link>
            ))}
            <div className="nav-popover-wrap">
              <button
                className={`nav-link ${moreOpen ? 'nav-link-active' : ''}`}
                onClick={() => setMoreOpen((value) => !value)}
                aria-expanded={moreOpen}
              >
                <Icon name="more" size={26} active={moreOpen} />
                <span>More</span>
              </button>
              {moreOpen && (
                <div className="nav-popover" role="menu">
                  <Link role="menuitem" href="/i/topics">
                    <Icon name="topic" />
                    Topics
                  </Link>
                  <Link role="menuitem" href="/i/moments">
                    <Icon name="moment" />
                    Moments
                  </Link>
                  <Link role="menuitem" href="/settings">
                    <Icon name="settings" />
                    Settings and privacy
                  </Link>
                  <button role="menuitem" onClick={() => setShortcutsOpen(true)}>
                    <span className="shortcut-question">?</span>Keyboard shortcuts
                  </button>
                </div>
              )}
            </div>
          </nav>
          <button className="compose-nav-button" onClick={openCompose}>
            <Icon name="feather" size={24} />
            <span>Tweet</span>
          </button>
          <div className="account-popover-wrap">
            <button
              className="account-switcher"
              onClick={() => setAccountOpen((value) => !value)}
              aria-expanded={accountOpen}
            >
              <Avatar user={viewer} size={40} />
              <span className="account-switcher-copy">
                <strong>{viewer.name}</strong>
                <small>@{viewer.handle}</small>
              </span>
              <Icon name="more" size={20} />
            </button>
            {accountOpen && (
              <div className="account-popover" role="menu">
                <AccountSessions viewer={viewer} />
                <button role="menuitem" onClick={() => router.push('/i/flow/add_account')}>
                  Add an existing account
                </button>
                <button role="menuitem" onClick={() => void signOut()}>
                  Log out @{viewer.handle}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="main-column">
        {children}
      </main>
      {!hideRightSidebar && <RightSidebar />}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems
          .filter((item) =>
            ['Home', 'Explore', 'Notifications', 'Messages', 'Profile'].includes(item.label),
          )
          .map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive(item) ? 'page' : undefined}
              className={isActive(item) ? 'active' : ''}
            >
              <Icon name={item.icon} size={26} active={isActive(item)} />
            </Link>
          ))}
      </nav>
      <button className="mobile-compose" onClick={openCompose} aria-label="Compose a Tweet">
        <Icon name="feather" size={24} />
      </button>

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Compose a Tweet"
        className="compose-modal"
      >
        <div className="modal-titlebar">
          <button className="icon-button" onClick={() => setComposeOpen(false)} aria-label="Close">
            <Icon name="close" />
          </button>
          <Link
            className="drafts-link"
            href="/compose/drafts"
            onClick={() => setComposeOpen(false)}
          >
            Drafts
          </Link>
        </div>
        <TweetComposer autoFocus modal onCreated={() => setComposeOpen(false)} />
      </Modal>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

function GuestShell({
  children,
  hideRightSidebar,
  wide,
}: {
  children: React.ReactNode;
  hideRightSidebar: boolean;
  wide: boolean;
}) {
  const pathname = usePathname();
  return (
    <div
      className={`app-frame guest-frame ${hideRightSidebar ? 'app-frame-two-column' : ''} ${wide ? 'app-frame-wide' : ''}`}
    >
      <header className="primary-rail" aria-label="Primary">
        <div className="primary-rail-inner">
          <Link href="/" className="brand-button" aria-label="Twitter home">
            <Icon name="bird" size={29} />
          </Link>
          <nav className="primary-nav" aria-label="Primary navigation">
            <Link
              href="/explore"
              className={`nav-link ${pathname === '/explore' || pathname.startsWith('/search') ? 'nav-link-active' : ''}`}
            >
              <Icon
                name="explore"
                size={26}
                active={pathname === '/explore' || pathname.startsWith('/search')}
              />
              <span>Explore</span>
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="main-column">
        {children}
      </main>
      {!hideRightSidebar && <RightSidebar />}
      <aside className="guest-join-bar" aria-label="Join Twitter">
        <span>
          <strong>Don&apos;t miss what&apos;s happening</strong>
          <small>People on Twitter are the first to know.</small>
        </span>
        <Link className="button guest-login" href="/login">
          Log in
        </Link>
        <Link className="button guest-signup" href="/signup">
          Sign up
        </Link>
      </aside>
    </div>
  );
}

type DeviceSession = { session: { token: string }; user: Record<string, unknown> };
function AccountSessions({ viewer }: { viewer: User }) {
  const { refresh } = useSession();
  const { data } = useApi<unknown>('/api/auth/multi-session/list-device-sessions');
  const sessions = Array.isArray(data) ? (data as DeviceSession[]) : [];
  if (!sessions.length)
    return (
      <div className="account-popover-user">
        <Avatar user={viewer} size={48} />
        <span>
          <strong>{viewer.name}</strong>
          <small>@{viewer.handle}</small>
        </span>
        <Icon name="check" size={20} />
      </div>
    );
  return (
    <div className="device-sessions">
      {sessions.map((entry) => {
        const user = normalizeUser(entry.user);
        const active = user.id === viewer.id;
        return (
          <button
            key={entry.session.token}
            className="device-session"
            disabled={active}
            onClick={async () => {
              await apiFetch('/api/auth/multi-session/set-active', {
                method: 'POST',
                body: JSON.stringify({ sessionToken: entry.session.token }),
              });
              await refresh();
              window.location.assign('/home');
            }}
          >
            <Avatar user={user} size={40} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {typeof entry.user.email === 'string' ? entry.user.email : `@${user.handle}`}
              </small>
            </span>
            {active && <Icon name="check" size={19} />}
          </button>
        );
      })}
    </div>
  );
}

type ShellSkeletonVariant = 'timeline' | 'explore' | 'messages' | 'message-detail';

function ShellSkeleton({
  hideRightSidebar = false,
  wide = false,
  variant = 'timeline',
}: {
  hideRightSidebar?: boolean;
  wide?: boolean;
  variant?: ShellSkeletonVariant;
}) {
  return (
    <div
      className={`app-frame shell-skeleton ${hideRightSidebar ? 'app-frame-two-column' : ''} ${wide ? 'app-frame-wide' : ''}`}
      aria-label="Loading Twitter"
    >
      <aside className="primary-rail">
        <div className="primary-rail-inner">
          <div className="brand-button">
            <Icon name="bird" size={29} />
          </div>
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} height={48} width={190} round />
          ))}
        </div>
      </aside>
      <main className={`main-column shell-skeleton-main shell-skeleton-main-${variant}`}>
        {variant === 'explore' ? (
          <ExploreShellSkeleton />
        ) : variant === 'messages' || variant === 'message-detail' ? (
          <MessagesShellSkeleton detailSelected={variant === 'message-detail'} />
        ) : (
          <TimelineShellSkeleton />
        )}
      </main>
      {!hideRightSidebar && (
        <aside className="right-rail">
          <Skeleton height={44} round />
          <Skeleton height={320} />
        </aside>
      )}
    </div>
  );
}

function TimelineShellSkeleton() {
  return (
    <>
      <div className="page-header">
        <Skeleton width={130} height={22} />
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="tweet-skeleton" key={index}>
          <Skeleton width={48} height={48} round />
          <div>
            <Skeleton width="35%" />
            <Skeleton width="92%" />
            <Skeleton width="75%" />
          </div>
        </div>
      ))}
    </>
  );
}

function ExploreShellSkeleton() {
  return (
    <>
      <div className="explore-shell-skeleton-header">
        <Skeleton width="100%" height={43} round />
        <Skeleton width={38} height={38} round />
      </div>
      <div className="explore-shell-skeleton-tabs">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} width={index === 4 ? 76 : 54} height={14} />
        ))}
      </div>
      <div className="explore-shell-skeleton-heading">
        <Skeleton width={145} height={20} />
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="explore-shell-skeleton-trend" key={index}>
          <Skeleton width={index % 2 ? '27%' : '34%'} height={11} />
          <Skeleton width={index % 2 ? '51%' : '43%'} height={15} />
          <Skeleton width="23%" height={11} />
        </div>
      ))}
    </>
  );
}

function MessagesShellSkeleton({ detailSelected }: { detailSelected: boolean }) {
  return (
    <div
      className={`messages-shell-skeleton-layout ${detailSelected ? 'messages-shell-skeleton-selected' : ''}`}
    >
      <section className="messages-shell-skeleton-list" aria-hidden="true">
        <div className="messages-shell-skeleton-header">
          <Skeleton width={96} height={20} />
          <span>
            <Skeleton width={34} height={34} round />
            <Skeleton width={34} height={34} round />
          </span>
        </div>
        <div className="messages-shell-skeleton-search">
          <Skeleton width="100%" height={30} round />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="messages-shell-skeleton-row" key={index}>
            <Skeleton width={48} height={48} round />
            <span>
              <Skeleton width={index % 2 ? '54%' : '68%'} height={14} />
              <Skeleton width={index % 2 ? '78%' : '61%'} height={13} />
            </span>
          </div>
        ))}
      </section>
      <section className="messages-shell-skeleton-detail" aria-hidden="true">
        {detailSelected ? (
          <>
            <div className="messages-shell-skeleton-detail-header">
              <Skeleton width={32} height={32} round />
              <span>
                <Skeleton width={124} height={14} />
                <Skeleton width={82} height={11} />
              </span>
              <Skeleton width={34} height={34} round />
            </div>
            <div className="messages-shell-skeleton-thread">
              <Skeleton width="34%" height={42} round />
              <Skeleton width="49%" height={58} round />
              <Skeleton width="38%" height={42} round />
            </div>
          </>
        ) : (
          <div className="messages-shell-skeleton-empty">
            <Skeleton width={220} height={23} />
            <Skeleton width={310} height={14} />
            <Skeleton width={118} height={36} round />
          </div>
        )}
      </section>
    </div>
  );
}

function AccessGate() {
  return (
    <div className="access-gate" id="main-content">
      <div className="access-gate-card">
        <Icon name="bird" size={44} />
        <h1>See what’s happening in the world right now</h1>
        <p>Log in to continue to Twitter.</p>
        <Link className="button button-primary" href="/login">
          Log in
        </Link>
        <Link className="button" href="/signup">
          Sign up
        </Link>
      </div>
    </div>
  );
}

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = [
    ['n', 'New Tweet'],
    ['/', 'Search'],
    ['j', 'Next Tweet'],
    ['k', 'Previous Tweet'],
    ['r', 'Reply'],
    ['t', 'Retweet'],
    ['l', 'Like'],
    ['m', 'Direct message'],
    ['?', 'This menu'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" className="shortcuts-modal">
      <div className="shortcuts-heading">
        <h2>Keyboard shortcuts</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="shortcuts-grid">
        {groups.map(([key, label]) => (
          <div key={key}>
            <kbd>{key}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function PageHeader({
  title,
  subtitle,
  back = false,
  action,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  back?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      <div className="page-header">
        {back && (
          <button className="icon-button page-back" onClick={() => router.back()} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="page-header-action">{action}</div>
      </div>
      {children}
    </>
  );
}

export function Tabs({
  items,
}: {
  items: Array<{ label: string; href: string; active: boolean }>;
}) {
  return (
    <nav className="tabs" aria-label="Page views">
      {items.map((item) => (
        <Link
          key={item.label}
          className={item.active ? 'active' : ''}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <span className="state-icon" aria-hidden="true">
          <Icon name={icon} size={32} />
        </span>
      )}
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message?: string; retry?: () => void }) {
  const normalized = message?.trim().toLowerCase() || '';
  const generic =
    !normalized ||
    normalized.includes('something went wrong') ||
    normalized.includes('request failed') ||
    normalized.includes('internal error');
  return (
    <div className="error-state" role="alert">
      <p>{generic ? 'Something went wrong.' : message}</p>
      {retry && (
        <button className="button button-primary" onClick={retry}>
          <Icon name="refresh" size={17} />
          Try again
        </button>
      )}
    </div>
  );
}
