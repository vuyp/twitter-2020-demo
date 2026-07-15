import { followUser, unfollowUser } from '@/server/api/users';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(followUser);
export const DELETE = apiRoute(unfollowUser);
