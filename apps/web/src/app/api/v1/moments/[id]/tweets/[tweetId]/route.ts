import { removeMomentTweet } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const DELETE = apiRoute(removeMomentTweet);
