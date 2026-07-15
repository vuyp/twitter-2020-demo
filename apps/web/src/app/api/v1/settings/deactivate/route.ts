import { deactivateAccount } from '@/server/api/account';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(deactivateAccount);
