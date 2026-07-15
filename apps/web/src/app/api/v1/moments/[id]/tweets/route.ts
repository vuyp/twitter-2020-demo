import { addMomentTweet } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(addMomentTweet);
