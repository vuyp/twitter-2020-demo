import { createList, getLists } from '@/server/api/lists';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getLists);
export const POST = apiRoute(createList);
