import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

export default function NotFound() {
  return (
    <main id="main-content" className="access-gate">
      <div className="access-gate-card">
        <Icon name="bird" size={42} />
        <h1>Hmm...this page doesn’t exist.</h1>
        <p>Try searching for something else.</p>
        <Link className="button button-primary" href="/explore">
          Search Twitter
        </Link>
      </div>
    </main>
  );
}
