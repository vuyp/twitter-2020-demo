/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './icon';
import type { User } from '@/components/types';

export function Avatar({
  user,
  size = 48,
  className = '',
}: {
  user?: User | null | undefined;
  size?: number;
  className?: string;
}) {
  const initials = (user?.name || 'Account')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="verified-badge" title="Verified account">
      <Icon name="check" size={10} />
      <span className="sr-only">Verified account</span>
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panel.current) {
        const focusable = [
          ...panel.current.querySelectorAll<HTMLElement>(
            "button, a, input, textarea, select, [tabindex]:not([tabindex='-1'])",
          ),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>('button, input, textarea')?.focus(),
    );
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className={`modal-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  round = false,
}: {
  width?: string | number;
  height?: number;
  round?: boolean;
}) {
  return (
    <span
      className={`skeleton ${round ? 'skeleton-round' : ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
