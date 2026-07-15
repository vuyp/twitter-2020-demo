import { deleteTweet, getTweet } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getTweet);
export const DELETE = apiRoute(deleteTweet);
