import { getListTimeline } from '@/server/api/lists';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getListTimeline);
