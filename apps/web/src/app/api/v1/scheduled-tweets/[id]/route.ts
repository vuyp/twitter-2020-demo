import { deleteScheduledTweet, updateScheduledTweet } from '@/server/api/drafts';
import { apiRoute } from '@/server/http';

export const PATCH = apiRoute(updateScheduledTweet);
export const DELETE = apiRoute(deleteScheduledTweet);
