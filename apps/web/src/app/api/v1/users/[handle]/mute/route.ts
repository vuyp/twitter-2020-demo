import { muteUser, unmuteUser } from '@/server/api/users';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(muteUser);
export const DELETE = apiRoute(unmuteUser);
