'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, PageHeader } from '@/components/shell/app-shell';
import { Icon } from '@/components/ui/icon';
import { TweetComposer } from '@/components/timeline/tweet-composer';
import { Timeline } from '@/components/timeline/timeline';
import type { Tweet } from '@/components/types';
import { apiFetch, useApi } from '@/hooks/use-api';

export function HomeScreen() {
  const [mode, setMode] = useState<'top' | 'latest'>('top');
  const [menuOpen, setMenuOpen] = useState(false);
  const [created, setCreated] = useState<Tweet | null>(null);
  const [newPrompt, setNewPrompt] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data: settings } = useApi<{ defaultTimeline?: 'top' | 'latest' }>('/api/v1/settings');

  useEffect(() => {
    if (!settings?.defaultTimeline) return;
    // This hydrates a server-backed preference after the initial shell render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(settings.defaultTimeline);
  }, [settings?.defaultTimeline]);

  useEffect(() => {
    const onNewTweet = () => setNewPrompt(true);
    window.addEventListener('twitter:timeline-new', onNewTweet);
    return () => window.removeEventListener('twitter:timeline-new', onNewTweet);
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Home"
        action={
          <div className="home-switcher-wrap">
            <button
              className="icon-button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Timeline settings"
              aria-expanded={menuOpen}
            >
              <Icon name="sparkle" size={23} />
            </button>
            {menuOpen && (
              <div className="home-switcher">
                <div className="home-switcher-hero">
                  <Icon name="sparkle" size={34} />
                  <strong>
                    {mode === 'top'
                      ? 'Top Tweets show up first'
                      : 'Latest Tweets show up as they happen'}
                  </strong>
                </div>
                <button
                  onClick={() => {
                    const nextMode = mode === 'top' ? 'latest' : 'top';
                    setMode(nextMode);
                    void apiFetch('/api/v1/settings', {
                      method: 'PATCH',
                      body: JSON.stringify({ defaultTimeline: nextMode }),
                    });
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="retweet" size={21} />
                  <span>
                    <strong>See {mode === 'top' ? 'latest' : 'top'} Tweets instead</strong>
                    <small>
                      You’ll be switched to the {mode === 'top' ? 'latest' : 'top'} view.
                    </small>
                  </span>
                </button>
                <Link href="/settings/content_preferences">
                  <Icon name="settings" size={21} />
                  <span>
                    <strong>View content preferences</strong>
                    <small>Choose what you see on Twitter.</small>
                  </span>
                </Link>
              </div>
            )}
          </div>
        }
      />
      {newPrompt && (
        <button
          className="new-tweets-prompt"
          onClick={() => {
            setNewPrompt(false);
            setRefreshVersion((value) => value + 1);
            window.scrollTo({ top: 0 });
          }}
        >
          See new Tweets
        </button>
      )}
      <TweetComposer onCreated={setCreated} />
      <Timeline
        endpoint={`/api/v1/timeline?mode=${mode}`}
        refreshKey={`${mode}-${refreshVersion}`}
        prepend={created}
        emptyAction={
          <Link className="button button-primary" href="/connect_people">
            Find people to follow
          </Link>
        }
      />
    </AppShell>
  );
}
