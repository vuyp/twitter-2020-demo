import { getReplies, replyToTweet } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getReplies);
export const POST = apiRoute(replyToTweet);
