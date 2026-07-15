'use client';
import { Icon } from '@/components/ui/icon';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="access-gate">
      <div className="access-gate-card">
        <Icon name="bird" size={42} />
        <h1>Something went wrong</h1>
        <p>Don’t fret — let’s give it another shot.</p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
