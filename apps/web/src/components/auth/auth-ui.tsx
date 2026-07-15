'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Modal, Spinner } from '@/components/ui/primitives';
import { useSession } from '@/components/providers/app-providers';
import { apiFetch } from '@/hooks/use-api';
import { isAuthenticatedSignupResult } from './signup-result';
import '@/styles/auth.css';

export type AuthMode = 'login' | 'signup';

export function LoggedOutLanding() {
  const { viewer, loading } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [cookieVisible, setCookieVisible] = useState(false);

  useEffect(() => {
    if (!loading && viewer) router.replace(viewer.handle ? '/home' : '/i/flow/onboarding');
  }, [viewer, loading, router]);
  useEffect(() => {
    // Reading a browser preference necessarily hydrates this client-only notice after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCookieVisible(localStorage.getItem('twitter-cookie-notice') !== 'dismissed');
  }, []);

  if (loading || viewer)
    return (
      <div className="landing-loading">
        <Icon name="bird" size={54} />
      </div>
    );

  return (
    <main id="main-content" className="logged-out-page">
      <section className="landing-benefits" aria-label="What you can do on Twitter">
        <div className="landing-bird-bg">
          <Icon name="bird" size={950} />
        </div>
        <ul>
          <li>
            <Icon name="search" size={28} />
            <span>Follow your interests.</span>
          </li>
          <li>
            <Icon name="people" size={28} />
            <span>Hear what people are talking about.</span>
          </li>
          <li>
            <Icon name="reply" size={28} />
            <span>Join the conversation.</span>
          </li>
        </ul>
      </section>
      <section className="landing-join">
        <div className="landing-card">
          <div className="landing-card-head">
            <Icon name="bird" size={42} />
            <button className="button" onClick={() => setMode('login')}>
              Log in
            </button>
          </div>
          <h1>See what’s happening in the world right now</h1>
          <h2>Join Twitter today.</h2>
          <button className="button button-primary landing-cta" onClick={() => setMode('signup')}>
            Sign up
          </button>
          <button className="button landing-cta" onClick={() => setMode('login')}>
            Log in
          </button>
        </div>
      </section>
      <Footer />
      {cookieVisible && (
        <div className="cookie-notice">
          <p>This unofficial demo stores essential session and preference cookies.</p>
          <button
            className="button button-primary"
            onClick={() => {
              localStorage.setItem('twitter-cookie-notice', 'dismissed');
              setCookieVisible(false);
            }}
          >
            Got it
          </button>
        </div>
      )}
      <AuthModal mode={mode} onClose={() => setMode(null)} onSwitch={setMode} />
    </main>
  );
}

export function AuthModal({
  mode,
  onClose,
  onSwitch,
}: {
  mode: AuthMode | null;
  onClose: () => void;
  onSwitch: (mode: AuthMode) => void;
}) {
  const close = () => {
    if (mode === 'signup') sessionStorage.removeItem('twitter-pending-onboarding');
    onClose();
  };
  return (
    <Modal
      open={Boolean(mode)}
      onClose={close}
      title={mode === 'signup' ? 'Create your account' : 'Log in to Twitter'}
      className="auth-modal"
    >
      {mode && <AuthForm mode={mode} modal onClose={close} onSwitch={onSwitch} />}
    </Modal>
  );
}

export function AuthFlowPage({
  mode,
  allowExisting = false,
}: {
  mode: AuthMode;
  allowExisting?: boolean;
}) {
  const { viewer, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!allowExisting && !loading && viewer)
      router.replace(viewer.handle ? '/home' : '/i/flow/onboarding');
  }, [allowExisting, loading, viewer, router]);
  return (
    <main id="main-content" className="auth-flow-page">
      <div className="auth-flow-card">
        <AuthForm mode={mode} />
      </div>
    </main>
  );
}

export function OnboardingScreen() {
  const router = useRouter();
  const { viewer, refresh } = useSession();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem('twitter-pending-onboarding') || '{}',
      ) as Record<string, string>;
      const pending =
        viewer?.email && stored.email?.toLowerCase() === viewer.email.toLowerCase() ? stored : {};
      if (stored.email && viewer?.email && !pending.email)
        sessionStorage.removeItem('twitter-pending-onboarding');
      // Better Auth resolves the viewer after mount; hydrate the form once it does.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(pending.name || viewer?.name || '');
      setHandle(pending.handle || viewer?.handle || '');
      setBirthDate(pending.birthDate || '');
    } catch {
      setName(viewer?.name || '');
    }
  }, [viewer]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/v1/users/me/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          handle: handle.trim(),
          ...(birthDate ? { birthDate } : {}),
        }),
      });
      sessionStorage.removeItem('twitter-pending-onboarding');
      await refresh();
      router.replace('/home');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'We couldn’t finish setting up your account.',
      );
      setSaving(false);
    }
  };
  return (
    <main id="main-content" className="auth-flow-page">
      <div className="auth-flow-card">
        <div className="auth-form-wrap">
          <div className="auth-form-top">
            <Icon name="bird" size={31} />
          </div>
          <h1>Customize your account</h1>
          <p className="onboarding-copy">
            Choose the name and username people will see on Twitter. You can change these later.
          </p>
          <form onSubmit={save}>
            <FloatingField label="Name" value={name} onChange={setName} maxLength={50} required />
            <FloatingField
              label="Username"
              value={handle}
              onChange={(value) => setHandle(value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 15))}
              maxLength={15}
              prefix="@"
              required
            />
            <label className="onboarding-date">
              Date of birth <span>This isn’t shown publicly.</span>
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button button-primary auth-submit"
              disabled={saving || !name.trim() || !handle.trim()}
            >
              {saving ? <Spinner /> : 'Next'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export function PasswordResetRequestScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), redirectTo: '/account/reset_password' }),
      });
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We couldn’t send the reset email.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main id="main-content" className="auth-flow-page">
      <div className="auth-flow-card">
        <div className="auth-form-wrap">
          <div className="auth-form-top">
            <Icon name="bird" size={31} />
          </div>
          {sent ? (
            <div className="auth-success">
              <span className="auth-success-icon">
                <Icon name="mail" size={34} />
              </span>
              <h1>Check your email</h1>
              <p>
                If an account exists for <strong>{email}</strong>, we sent instructions for
                resetting its password.
              </p>
              <Link className="button button-primary" href="/login">
                Return to login
              </Link>
            </div>
          ) : (
            <>
              <h1>Find your Twitter account</h1>
              <p className="onboarding-copy">
                Enter the email address associated with your account.
              </p>
              <form onSubmit={submit}>
                <FloatingField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={setEmail}
                />
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                <button className="button button-primary auth-submit" disabled={!email || loading}>
                  {loading ? <Spinner /> : 'Search'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export function ResetPasswordScreen() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : 'This password reset link is invalid or has expired.',
  );
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your password couldn’t be reset.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main id="main-content" className="auth-flow-page">
      <div className="auth-flow-card">
        <div className="auth-form-wrap">
          <div className="auth-form-top">
            <Icon name="bird" size={31} />
          </div>
          {done ? (
            <div className="auth-success">
              <span className="auth-success-icon">
                <Icon name="check" size={34} />
              </span>
              <h1>Password changed</h1>
              <p>You can now log in with your new password.</p>
              <Link className="button button-primary" href="/login">
                Log in
              </Link>
            </div>
          ) : (
            <>
              <h1>Choose a new password</h1>
              <form onSubmit={submit}>
                <FloatingField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={setPassword}
                />
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                <button
                  className="button button-primary auth-submit"
                  disabled={!token || password.length < 8 || loading}
                >
                  {loading ? <Spinner /> : 'Save'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export function VerificationResultScreen() {
  const params = useSearchParams();
  const failed = Boolean(params.get('error'));
  return (
    <main id="main-content" className="auth-flow-page">
      <div className="auth-flow-card">
        <div className="auth-form-wrap">
          <div className="auth-form-top">
            <Icon name="bird" size={31} />
          </div>
          <div className="auth-success">
            <span className="auth-success-icon">
              <Icon name={failed ? 'warning' : 'check'} size={34} />
            </span>
            <h1>{failed ? 'That confirmation link didn’t work' : 'Email confirmed'}</h1>
            <p>
              {failed
                ? 'The link may have expired or already been used. Try logging in or request another email.'
                : 'Your email is verified. Log in to finish setting up your Twitter account.'}
            </p>
            <Link className="button button-primary" href="/login">
              Log in
            </Link>
            {failed && (
              <Link className="button" href="/signup">
                Create an account
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function AuthForm({
  mode,
  modal = false,
  onClose,
  onSwitch,
}: {
  mode: AuthMode;
  modal?: boolean;
  onClose?: () => void;
  onSwitch?: (mode: AuthMode) => void;
}) {
  const router = useRouter();
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeLogin = async (preservePendingOnboarding = false) => {
    await refresh();
    const pending = JSON.parse(
      sessionStorage.getItem('twitter-pending-onboarding') || '{}',
    ) as Record<string, string>;
    const samePendingAccount = pending.email?.toLowerCase() === email.trim().toLowerCase();
    if (!samePendingAccount) sessionStorage.removeItem('twitter-pending-onboarding');
    router.push(samePendingAccount ? '/i/flow/onboarding' : '/home');
    router.refresh();
    if (!preservePendingOnboarding) onClose?.();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const birthDate =
          birthYear && birthMonth && birthDay
            ? `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
            : '';
        const pending = {
          name: name.trim(),
          handle: handle.replace(/^@/, '').trim(),
          birthDate,
          email: email.trim(),
        };
        sessionStorage.setItem('twitter-pending-onboarding', JSON.stringify(pending));
        const signUp = await apiFetch<unknown>('/api/auth/sign-up/email', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: '/verify-email?verified=true',
          }),
        });
        if (isAuthenticatedSignupResult(signUp)) {
          await completeLogin(true);
          return;
        }
        setVerificationSent(true);
        return;
      } else {
        const signIn = await apiFetch<{ twoFactorRedirect?: boolean }>('/api/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password, callbackURL: '/home' }),
        });
        if (signIn.twoFactorRedirect) {
          setTwoFactorPending(true);
          setPassword('');
          return;
        }
      }
      await completeLogin();
    } catch (reason) {
      if (mode === 'signup') sessionStorage.removeItem('twitter-pending-onboarding');
      setError(
        reason instanceof Error
          ? reason.message
          : mode === 'signup'
            ? 'We couldn’t create your account.'
            : 'The email and password you entered did not match our records.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const verifySecondFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!twoFactorCode || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(
        useBackupCode
          ? '/api/auth/two-factor/verify-backup-code'
          : '/api/auth/two-factor/verify-totp',
        {
          method: 'POST',
          body: JSON.stringify({ code: twoFactorCode, trustDevice }),
        },
      );
      await completeLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That authentication code is invalid.');
    } finally {
      setSubmitting(false);
    }
  };

  if (twoFactorPending)
    return (
      <div className={`auth-form-wrap ${modal ? 'auth-form-modal' : ''}`}>
        <div className="auth-form-top">
          {modal && (
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
          <Icon name="bird" size={31} />
        </div>
        <h1>Enter your authentication code</h1>
        <p className="auth-consent">
          {useBackupCode
            ? 'Enter one of the backup codes you saved when you enabled two-factor authentication.'
            : 'Open your authenticator app and enter the six-digit code for this account.'}
        </p>
        <form onSubmit={verifySecondFactor}>
          <FloatingField
            label={useBackupCode ? 'Backup code' : 'Authentication code'}
            value={twoFactorCode}
            onChange={(value) =>
              setTwoFactorCode(
                useBackupCode ? value.trim().slice(0, 32) : value.replace(/\D/g, '').slice(0, 6),
              )
            }
            required
            autoComplete="one-time-code"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            pattern={useBackupCode ? undefined : '[0-9]{6}'}
          />
          <label className="auth-trust-device">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            Trust this device for 30 days
          </label>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button button-primary auth-submit"
            disabled={
              submitting || (useBackupCode ? !twoFactorCode : !/^\d{6}$/.test(twoFactorCode))
            }
          >
            {submitting ? <Spinner label="Verifying code" /> : 'Verify'}
          </button>
        </form>
        <button
          className="auth-text-button auth-code-switch"
          onClick={() => {
            setUseBackupCode((current) => !current);
            setTwoFactorCode('');
            setError(null);
          }}
        >
          {useBackupCode ? 'Use an authenticator app instead' : 'Use a backup code'}
        </button>
        <button
          className="auth-text-button"
          onClick={() => {
            setTwoFactorPending(false);
            setTwoFactorCode('');
            setError(null);
          }}
        >
          Back to login
        </button>
      </div>
    );

  if (verificationSent)
    return (
      <div className="auth-success">
        <div className="auth-form-top">
          <Icon name="bird" size={31} />
        </div>
        <span className="auth-success-icon">
          <Icon name="mail" size={34} />
        </span>
        <h1>Check your email</h1>
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your
          account.
        </p>
        <button
          className="button button-primary"
          onClick={async () => {
            try {
              await apiFetch('/api/auth/send-verification-email', {
                method: 'POST',
                body: JSON.stringify({ email, callbackURL: '/verify-email?verified=true' }),
              });
              setError(null);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'We couldn’t resend the email.');
            }
          }}
        >
          Resend email
        </button>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="auth-text-button"
          onClick={() => {
            sessionStorage.removeItem('twitter-pending-onboarding');
            setVerificationSent(false);
          }}
        >
          Use a different email
        </button>
      </div>
    );

  const switchMode = () => {
    const next = mode === 'login' ? 'signup' : 'login';
    if (mode === 'signup') sessionStorage.removeItem('twitter-pending-onboarding');
    if (onSwitch) onSwitch(next);
    else router.push(`/${next}`);
  };

  return (
    <div className={`auth-form-wrap ${modal ? 'auth-form-modal' : ''}`}>
      <div className="auth-form-top">
        {modal && (
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        )}
        <Icon name="bird" size={31} />
      </div>
      <h1>{mode === 'signup' ? 'Create your account' : 'Log in to Twitter'}</h1>
      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <FloatingField label="Name" value={name} onChange={setName} maxLength={50} required />
            <FloatingField
              label="Username"
              value={handle}
              onChange={(value) => setHandle(value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 15))}
              maxLength={15}
              required
              prefix="@"
            />
            <fieldset className="birth-date">
              <legend>Date of birth</legend>
              <p>
                This will not be shown publicly. Confirm your own age, even if this account is for a
                business, a pet, or something else.
              </p>
              <div>
                <label>
                  Month
                  <select
                    value={birthMonth}
                    onChange={(event) => setBirthMonth(event.target.value)}
                    required
                  >
                    <option value="">Month</option>
                    {Array.from({ length: 12 }).map((_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {new Date(2020, index, 1).toLocaleDateString(undefined, { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Day
                  <select
                    value={birthDay}
                    onChange={(event) => setBirthDay(event.target.value)}
                    required
                  >
                    <option value="">Day</option>
                    {Array.from({ length: 31 }).map((_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Year
                  <select
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                    required
                  >
                    <option value="">Year</option>
                    {Array.from({ length: 120 }).map((_, index) => {
                      const year = new Date().getFullYear() - index;
                      return <option key={year}>{year}</option>;
                    })}
                  </select>
                </label>
              </div>
            </fieldset>
          </>
        )}
        <FloatingField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <div className="password-field">
          <FloatingField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name="eye" size={20} />
          </button>
        </div>
        {mode === 'signup' && (
          <p className="auth-consent">
            Unofficial, temporary demo: use a made-up email address and a password you do not use
            anywhere else. Do not enter personal information.
          </p>
        )}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button button-primary auth-submit"
          disabled={
            submitting ||
            !email ||
            !password ||
            (mode === 'signup' && (!name || !handle || !birthMonth || !birthDay || !birthYear))
          }
        >
          {submitting ? (
            <Spinner label={mode === 'signup' ? 'Creating account' : 'Logging in'} />
          ) : mode === 'signup' ? (
            'Sign up'
          ) : (
            'Log in'
          )}
        </button>
      </form>
      {mode === 'login' && (
        <Link className="forgot-link" href="/account/begin_password_reset">
          Forgot password?
        </Link>
      )}
      <p className="auth-switch">
        {mode === 'login' ? 'Don’t have an account?' : 'Already have an account?'}{' '}
        <button onClick={switchMode}>{mode === 'login' ? 'Sign up' : 'Log in'}</button>
      </p>
    </div>
  );
}

function FloatingField({
  label,
  value,
  onChange,
  prefix,
  ...props
}: { label: string; value: string; onChange: (value: string) => void; prefix?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const id = `auth-${label.toLowerCase().replace(/\s/g, '-')}`;
  return (
    <label className="floating-field" htmlFor={id}>
      <span>{label}</span>
      <div>
        {prefix && <b>{prefix}</b>}
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
      </div>
      {props.maxLength && (
        <small>
          {value.length} / {props.maxLength}
        </small>
      )}
    </label>
  );
}

function Footer() {
  return (
    <footer className="landing-footer">
      <a href="https://about.twitter.com/" target="_blank" rel="noreferrer">
        About
      </a>
      <a href="https://help.twitter.com/" target="_blank" rel="noreferrer">
        Help Center
      </a>
      <a href="https://twitter.com/tos" target="_blank" rel="noreferrer">
        Terms of Service
      </a>
      <a href="https://twitter.com/privacy" target="_blank" rel="noreferrer">
        Privacy Policy
      </a>
      <a
        href="https://help.twitter.com/rules-and-policies/twitter-cookies"
        target="_blank"
        rel="noreferrer"
      >
        Cookie Policy
      </a>
      <a href="https://business.twitter.com/" target="_blank" rel="noreferrer">
        Ads info
      </a>
      <a href="https://blog.twitter.com/" target="_blank" rel="noreferrer">
        Blog
      </a>
      <a href="https://status.twitterstat.us/" target="_blank" rel="noreferrer">
        Status
      </a>
      <a href="https://careers.twitter.com/" target="_blank" rel="noreferrer">
        Careers
      </a>
      <a href="https://about.twitter.com/company/brand-resources" target="_blank" rel="noreferrer">
        Brand Resources
      </a>
      <a href="https://marketing.twitter.com/" target="_blank" rel="noreferrer">
        Marketing
      </a>
      <span>Unofficial UI demo · Not affiliated with Twitter/X</span>
    </footer>
  );
}
