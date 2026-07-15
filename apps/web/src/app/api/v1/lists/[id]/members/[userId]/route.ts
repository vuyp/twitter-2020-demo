import { addListMember, removeListMember } from '@/server/api/lists';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(addListMember);
export const DELETE = apiRoute(removeListMember);
