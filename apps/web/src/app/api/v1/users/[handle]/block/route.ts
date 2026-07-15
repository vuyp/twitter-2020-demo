import { blockUser, unblockUser } from '@/server/api/users';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(blockUser);
export const DELETE = apiRoute(unblockUser);
