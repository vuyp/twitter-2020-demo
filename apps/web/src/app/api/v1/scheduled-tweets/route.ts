import { getScheduledTweets } from '@/server/api/drafts';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getScheduledTweets);
