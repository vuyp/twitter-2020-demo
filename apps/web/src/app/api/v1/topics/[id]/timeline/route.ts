import { getTopicTimeline } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getTopicTimeline);
