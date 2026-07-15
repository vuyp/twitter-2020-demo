import { resolveFollowRequest } from '@/server/api/users';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(resolveFollowRequest);
