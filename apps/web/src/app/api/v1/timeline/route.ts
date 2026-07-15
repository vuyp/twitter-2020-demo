import { getHomeTimeline } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getHomeTimeline);
