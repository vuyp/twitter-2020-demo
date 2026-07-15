import { apiRoute } from '@/server/http';
import { updateMyProfile } from '@/server/api/users';

export const PATCH = apiRoute(updateMyProfile);
