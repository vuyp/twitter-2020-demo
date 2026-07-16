import { z } from 'zod';
import {
  accentColorSchema,
  countSchema,
  entityIdSchema,
  fontSizeSchema,
  isoDateSchema,
  themeSchema,
} from './common';

const RESERVED_HANDLES = new Set([
  'about',
  'account',
  'admin',
  'api',
  'assets',
  'bookmarks',
  'compose',
  'connect_people',
  'explore',
  'help',
  'home',
  'i',
  'images',
  'intent',
  'lists',
  'login',
  'manifest',
  'messages',
  'moments',
  'notifications',
  'oauth',
  'privacy',
  'robots',
  'search',
  'settings',
  'share',
  'signup',
  'sitemap',
  'static',
  'support',
  'topics',
  'tos',
  'twitter',
]);

export const handleSchema = z
  .string()
  .min(1)
  .max(15)
  .regex(/^[A-Za-z0-9_]+$/, 'Handles may only contain letters, numbers, and underscores')
  .refine((value) => !RESERVED_HANDLES.has(value.toLowerCase()), 'That username is reserved');

export const displayNameSchema = z.string().trim().min(1).max(50);

export const relationshipSchema = z.object({
  following: z.boolean(),
  followedBy: z.boolean(),
  followRequested: z.boolean(),
  blocking: z.boolean(),
  muting: z.boolean(),
  canDirectMessage: z.boolean(),
});

export const userSummarySchema = z.object({
  id: entityIdSchema,
  handle: handleSchema,
  name: displayNameSchema,
  bio: z.string().max(160).default(''),
  avatarUrl: z.string().url().nullable(),
  protected: z.boolean(),
  verified: z.boolean(),
  deactivated: z.boolean().default(false),
  relationship: relationshipSchema.optional(),
});

export const userProfileSchema = userSummarySchema.extend({
  bannerUrl: z.string().url().nullable(),
  location: z.string().max(30).default(''),
  websiteUrl: z.string().url().nullable(),
  joinedAt: isoDateSchema,
  birthDate: z.iso.date().nullable().optional(),
  followersCount: countSchema,
  followingCount: countSchema,
  tweetsCount: countSchema,
  likesCount: countSchema,
  listedCount: countSchema.default(0),
  pinnedTweetId: entityIdSchema.nullable(),
});

const birthDateSchema = z.iso.date().refine(isValidCalendarDate, 'Enter a valid calendar date');

export const updateProfileInputSchema = z.object({
  handle: handleSchema.optional(),
  name: displayNameSchema.optional(),
  bio: z.string().max(160).optional(),
  location: z.string().max(30).optional(),
  websiteUrl: z
    .union([z.string().url(), z.literal('')])
    .nullable()
    .optional(),
  birthDate: birthDateSchema.nullable().optional(),
  avatarMediaId: entityIdSchema.nullable().optional(),
  bannerMediaId: entityIdSchema.nullable().optional(),
});

export const onboardingInputSchema = z.object({
  handle: handleSchema,
  name: displayNameSchema,
  bio: z.string().max(160).optional(),
  birthDate: birthDateSchema
    .refine((value) => isAtLeastAge(value, 13), 'You must be at least 13 years old')
    .optional(),
  interests: z.array(entityIdSchema).max(100).default([]),
});

function isAtLeastAge(value: string, minimumAge: number): boolean {
  if (!isValidCalendarDate(value)) return false;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) return false;
  const today = new Date();
  const threshold = new Date(
    Date.UTC(today.getUTCFullYear() - minimumAge, today.getUTCMonth(), today.getUTCDate()),
  );
  return birthDate <= threshold;
}

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

export const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  likes: z.boolean(),
  retweets: z.boolean(),
  follows: z.boolean(),
  mentions: z.boolean(),
  directMessages: z.boolean(),
});

export const userSettingsSchema = z.object({
  theme: themeSchema,
  accentColor: accentColorSchema,
  fontSize: fontSizeSchema,
  reduceMotion: z.boolean(),
  autoplayVideo: z.boolean(),
  showSensitiveMedia: z.boolean(),
  protectedAccount: z.boolean(),
  discoverableByEmail: z.boolean(),
  allowPhotoTagging: z.boolean(),
  showReadReceipts: z.boolean(),
  allowDirectMessagesFrom: z.enum(['everyone', 'following']),
  defaultTimeline: z.enum(['top', 'latest']),
  notifications: notificationSettingsSchema,
});

export const updateUserSettingsInputSchema = userSettingsSchema.partial().extend({
  notifications: notificationSettingsSchema.partial().optional(),
});

export const sessionUserSchema = userSummarySchema.extend({
  email: z.email(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  onboardingComplete: z.boolean(),
  role: z.enum(['user', 'moderator', 'admin']),
});

export type Relationship = z.infer<typeof relationshipSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type UserSettings = z.infer<typeof userSettingsSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
