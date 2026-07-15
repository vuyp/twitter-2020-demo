import { getBlockedAccounts } from '@/server/api/users';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getBlockedAccounts);
