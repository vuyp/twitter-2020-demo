/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useRef } from 'react';
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
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" />
      ) : (
        <Icon name="user" size={Math.max(18, Math.round(size * 0.55))} active />
      )}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="verified-badge" title="Verified account">
      <svg viewBox="0 0 22 22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M20.4 11c0-1.2-1.5-2.1-1.9-3.1-.4-1 .1-2.7-.7-3.5-.8-.8-2.5-.3-3.5-.7C13.2 3.3 12.3 1.8 11 1.8c-1.2 0-2.1 1.5-3.1 1.9-1 .4-2.7-.1-3.5.7-.8.8-.3 2.5-.7 3.5C3.3 8.9 1.8 9.8 1.8 11c0 1.2 1.5 2.1 1.9 3.1.4 1-.1 2.7.7 3.5.8.8 2.5.3 3.5.7 1 .4 1.9 1.9 3.1 1.9 1.2 0 2.1-1.5 3.1-1.9 1-.4 2.7.1 3.5-.7.8-.8.3-2.5.7-3.5.6-1 2.1-1.9 2.1-3.1Z"
        />
        <path fill="#fff" d="m9.2 14.8-3.3-3.3 1.4-1.4 1.9 1.9 5.5-5.5 1.4 1.4-6.9 6.9Z" />
      </svg>
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
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab' && panel.current) {
        const focusable = [
          ...panel.current.querySelectorAll<HTMLElement>(
            "button, a, input, textarea, select, [tabindex]:not([tabindex='-1'])",
          ),
        ].filter(
          (element) =>
            !element.hasAttribute('disabled') &&
            element.getAttribute('aria-hidden') !== 'true' &&
            element.getClientRects().length > 0,
        );
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
    const focusFrame = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>('button, input, textarea')?.focus(),
    );
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className={`modal-panel${className ? ` ${className}` : ''}`}
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
