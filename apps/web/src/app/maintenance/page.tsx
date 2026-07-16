import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

export const metadata: Metadata = {
  title: 'Maintenance',
  description: 'Twitter is temporarily unavailable while maintenance is in progress.',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main id="main-content" className="maintenance-page">
      <header className="maintenance-header">
        <Link href="/" className="maintenance-home" aria-label="Twitter home">
          <Icon name="bird" size={31} />
        </Link>
      </header>
      <section className="maintenance-content" aria-labelledby="maintenance-title">
        <div className="maintenance-illustration" aria-hidden="true">
          <span className="maintenance-orbit maintenance-orbit-large">
            <Icon name="settings" size={62} />
          </span>
          <span className="maintenance-orbit maintenance-orbit-small">
            <Icon name="settings" size={34} />
          </span>
          <span className="maintenance-bird">
            <Icon name="bird" size={48} />
          </span>
        </div>
        <div className="maintenance-status">
          <span /> Maintenance in progress
        </div>
        <h1 id="maintenance-title">Twitter is temporarily unavailable</h1>
        <p>
          We&apos;re making a few improvements. You don&apos;t need to do anything&mdash;please try
          again in a few minutes.
        </p>
        <div className="maintenance-actions">
          <Link className="button button-primary" href="/">
            Try again
          </Link>
          <a href="https://help.twitter.com/" target="_blank" rel="noreferrer">
            Visit the Help Center
          </a>
        </div>
      </section>
      <footer className="maintenance-footer">
        <span>&copy; 2020 Twitter, Inc.</span>
        <span>Unofficial UI recreation</span>
      </footer>
    </main>
  );
}
