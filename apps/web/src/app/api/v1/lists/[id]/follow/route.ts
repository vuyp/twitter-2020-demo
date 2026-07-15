import { followList, unfollowList } from '@/server/api/lists';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(followList);
export const DELETE = apiRoute(unfollowList);
