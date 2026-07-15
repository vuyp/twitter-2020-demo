import { createTweet } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(createTweet);
