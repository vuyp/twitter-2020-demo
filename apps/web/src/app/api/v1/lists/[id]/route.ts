import { deleteList, getList, updateList } from '@/server/api/lists';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getList);
export const PATCH = apiRoute(updateList);
export const DELETE = apiRoute(deleteList);
