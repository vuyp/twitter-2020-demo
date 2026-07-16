'use client';
import { Icon } from '@/components/ui/icon';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="standalone-state">
      <div className="standalone-state-content">
        <Icon name="bird" size={39} />
        <p>Something went wrong, but don’t fret — let’s give it another shot.</p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
