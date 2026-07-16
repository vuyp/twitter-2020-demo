'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/hooks/use-api';
import { normalizeUser, type User } from '@/components/types';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_RETRY_DELAY_MS, realtimeTokenRefreshDelay } from './realtime-client';

export type ThemeName = 'light' | 'dim' | 'lights-out';
export type AccentName = 'blue' | 'yellow' | 'pink' | 'purple' | 'orange' | 'green';
export type FontSizeName = 'small' | 'default' | 'large' | 'xlarge';

type ThemeContextValue = {
  theme: ThemeName;
  accent: AccentName;
  fontSize: FontSizeName;
  autoplayVideo: boolean;
  setTheme: (value: ThemeName) => void;
  setAccent: (value: AccentName) => void;
  setFontSize: (value: FontSizeName) => void;
  setAutoplayVideo: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('light');
  const [accent, setAccentState] = useState<AccentName>('blue');
  const [fontSize, setFontSizeState] = useState<FontSizeName>('default');
  const [autoplayVideo, setAutoplayVideoState] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('twitter-theme') as ThemeName | null;
    const savedAccent = localStorage.getItem('twitter-accent') as AccentName | null;
    const savedFont = localStorage.getItem('twitter-font-size') as FontSizeName | null;
    const savedReduceMotion = localStorage.getItem('twitter-reduce-motion') === 'true';
    const savedAutoplay = localStorage.getItem('twitter-autoplay-video');
    document.documentElement.dataset.reduceMotion = String(savedReduceMotion);
    // Theme preferences live outside React in localStorage and are restored after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedTheme) setThemeState(savedTheme);
    if (savedAccent) setAccentState(savedAccent);
    if (savedFont) setFontSizeState(savedFont);
    if (savedAutoplay) setAutoplayVideoState(savedAutoplay === 'true');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.color = accent;
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem('twitter-theme', theme);
    localStorage.setItem('twitter-accent', accent);
    localStorage.setItem('twitter-font-size', fontSize);
    localStorage.setItem('twitter-autoplay-video', String(autoplayVideo));
  }, [theme, accent, fontSize, autoplayVideo]);

  const value = useMemo(
    () => ({
      theme,
      accent,
      fontSize,
      autoplayVideo,
      setTheme: setThemeState,
      setAccent: setAccentState,
      setFontSize: setFontSizeState,
      setAutoplayVideo: setAutoplayVideoState,
    }),
    [theme, accent, fontSize, autoplayVideo],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside AppProviders');
  return value;
}

type SessionContextValue = {
  viewer: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function SessionProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<unknown>('/api/v1/session');
      const source =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const candidate = source.user || source.viewer || payload;
      const user = candidate && typeof candidate === 'object' ? normalizeUser(candidate) : null;
      setViewer(user?.id || user?.handle ? user : null);
    } catch {
      setViewer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The session is an external cookie-backed resource, loaded on provider mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/sign-out', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      setViewer(null);
      window.location.assign('/');
    }
  }, []);

  const value = useMemo(
    () => ({ viewer, loading, refresh, signOut }),
    [viewer, loading, refresh, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { viewer } = useSession();
  useEffect(() => {
    if (!viewer) return;
    let disposed = false;
    let socket: Socket | undefined;
    let renewalTimer: number | undefined;
    let retryTimer: number | undefined;
    let refreshInFlight: Promise<void> | undefined;
    let hasConnected = false;
    let emitRealtimeEvent: ((event: Event) => void) | undefined;

    const announce = (name: string, detail?: unknown) =>
      window.dispatchEvent(new CustomEvent(name, { detail }));

    const announceRefresh = () => {
      announce('twitter:timeline-new');
      announce('twitter:notification-new');
      announce('twitter:dm-new');
    };

    const scheduleRetry = (delay = REALTIME_RETRY_DELAY_MS) => {
      if (disposed || retryTimer !== undefined) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void refreshConnection(true);
      }, delay);
    };

    const scheduleRenewal = (expiresAt: string) => {
      if (renewalTimer !== undefined) window.clearTimeout(renewalTimer);
      renewalTimer = window.setTimeout(() => {
        renewalTimer = undefined;
        void refreshConnection(true);
      }, realtimeTokenRefreshDelay(expiresAt));
    };

    const bindSocket = (activeSocket: Socket) => {
      activeSocket.on('timeline.new', (event) => announce('twitter:timeline-new', event));
      activeSocket.on('notification.created', (event) =>
        announce('twitter:notification-new', event),
      );
      activeSocket.on('notification.read', (event) => announce('twitter:notification-read', event));
      activeSocket.on('dm.created', (event) => announce('twitter:dm-new', event));
      activeSocket.on('dm.read', (event) => announce('twitter:dm-read', event));
      activeSocket.on('typing.started', (event) => announce('twitter:typing-started', event));
      activeSocket.on('typing.stopped', (event) => announce('twitter:typing-stopped', event));
      activeSocket.on('connect', () => {
        if (disposed) return;
        if (retryTimer !== undefined) {
          window.clearTimeout(retryTimer);
          retryTimer = undefined;
        }
        announce('twitter:realtime-status', { status: 'connected' });
        if (hasConnected) announceRefresh();
        hasConnected = true;
      });
      activeSocket.on('connect_error', () => {
        if (disposed) return;
        announce('twitter:realtime-status', { status: 'unavailable' });
        scheduleRetry();
      });
      activeSocket.on('disconnect', (reason) => {
        if (disposed) return;
        announce('twitter:realtime-status', { status: 'unavailable' });
        // A server-forced disconnect does not trigger Socket.IO's automatic reconnect.
        if (reason === 'io server disconnect') scheduleRetry(0);
      });

      emitRealtimeEvent = (event: Event) => {
        const detail = event instanceof CustomEvent ? event.detail : undefined;
        if (!detail || typeof detail.name !== 'string') return;
        if (
          !['typing.started', 'typing.stopped', 'dm.read', 'notification.read'].includes(
            detail.name,
          )
        )
          return;
        activeSocket.emit(detail.name, detail.payload);
      };
      window.addEventListener('twitter:realtime-emit', emitRealtimeEvent);
    };

    async function connectWithFreshToken(forceReconnect: boolean): Promise<void> {
      try {
        const payload = await apiFetch<{ token: string; expiresAt: string; url?: string }>(
          '/api/v1/realtime-token',
        );
        if (disposed || !payload.token) return;
        if (!socket) {
          socket = io(payload.url || window.location.origin, {
            path: '/socket.io',
            auth: { token: payload.token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            autoConnect: false,
          });
          bindSocket(socket);
        }
        socket.auth = { token: payload.token };
        if (forceReconnect && socket.connected) socket.disconnect();
        if (!socket.connected) socket.connect();
        scheduleRenewal(payload.expiresAt);
      } catch {
        // REST remains usable, and the UI never exposes infrastructure error text.
        if (!disposed) {
          announce('twitter:realtime-status', { status: 'unavailable' });
          scheduleRetry();
        }
      }
    }

    function refreshConnection(forceReconnect = false): Promise<void> {
      if (refreshInFlight) return refreshInFlight;
      const operation = connectWithFreshToken(forceReconnect);
      refreshInFlight = operation;
      const clear = () => {
        if (refreshInFlight === operation) refreshInFlight = undefined;
      };
      void operation.then(clear, clear);
      return operation;
    }

    void refreshConnection();
    return () => {
      disposed = true;
      if (renewalTimer !== undefined) window.clearTimeout(renewalTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (emitRealtimeEvent) window.removeEventListener('twitter:realtime-emit', emitRealtimeEvent);
      socket?.disconnect();
    };
  }, [viewer]);
  return children;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside AppProviders');
  return value;
}

type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
type ToastContextValue = { showToast: (message: string, action?: Toast['action']) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((value) => [...value, { id, message, ...(action ? { action } : {}) }]);
    window.setTimeout(() => setToasts((value) => value.filter((toast) => toast.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.action && <button onClick={toast.action.run}>{toast.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside AppProviders');
  return value;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <RealtimeProvider>
          <ToastProvider>{children}</ToastProvider>
        </RealtimeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
