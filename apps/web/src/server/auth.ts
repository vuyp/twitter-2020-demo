import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { multiSession, twoFactor } from 'better-auth/plugins';
import { Pool } from 'pg';
import { authDatabaseOptions } from './auth-database-options';
import { getServerEnv } from './env';
import { sendAuthEmail } from './mailer';

const env = getServerEnv();
const globalForAuth = globalThis as typeof globalThis & { __twitterAuthPool?: Pool };

export const authPool =
  globalForAuth.__twitterAuthPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === 'production' ? 20 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (env.NODE_ENV !== 'production') globalForAuth.__twitterAuthPool = authPool;

export const auth = betterAuth({
  appName: 'Twitter',
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: authPool,
  advanced: {
    database: authDatabaseOptions,
    cookiePrefix: 'twitter',
    useSecureCookies: new URL(env.APP_URL).protocol === 'https:',
  },
  user: {
    modelName: 'users',
    additionalFields: {
      role: {
        type: ['user', 'moderator', 'admin'],
        required: false,
        defaultValue: 'user',
        input: false,
      },
      status: {
        type: ['active', 'deactivated', 'suspended'],
        required: false,
        defaultValue: 'active',
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await sendAuthEmail({
          to: user.email,
          subject: 'Confirm your new email address',
          heading: 'Confirm your email',
          body: 'Use the button below to finish changing the email address on your Twitter account.',
          actionLabel: 'Confirm email',
          actionUrl: url,
        });
      },
    },
    deleteUser: { enabled: false },
  },
  session: {
    modelName: 'sessions',
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Status/role changes must take effect immediately for suspension and deactivation.
    cookieCache: { enabled: false },
  },
  account: { modelName: 'accounts' },
  verification: { modelName: 'verifications' },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: 'Reset your Twitter password',
        heading: 'Reset your password',
        body: "We received a request to reset your password. If this wasn't you, you can ignore this email.",
        actionLabel: 'Reset password',
        actionUrl: url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: 'Verify your Twitter account',
        heading: 'Verify your email address',
        body: 'Verify your email to finish setting up your Twitter account.',
        actionLabel: 'Verify now',
        actionUrl: url,
      });
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (newSession) => {
          const result = await authPool.query<{ status: string; deletionScheduledAt: Date | null }>(
            'SELECT status, "deletionScheduledAt" FROM users WHERE id = $1',
            [newSession.userId],
          );
          const account = result.rows[0];
          if (
            account?.status === 'deactivated' &&
            account.deletionScheduledAt &&
            account.deletionScheduledAt.getTime() > Date.now()
          ) {
            await authPool.query(
              `UPDATE users SET status = 'active', "deactivatedAt" = NULL,
                 "deletionScheduledAt" = NULL, "updatedAt" = now() WHERE id = $1`,
              [newSession.userId],
            );
          } else if (account?.status !== 'active') {
            return false;
          }
          return { data: newSession };
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: 'Twitter', twoFactorTable: 'two_factors' }),
    multiSession({ maximumSessions: 5 }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
