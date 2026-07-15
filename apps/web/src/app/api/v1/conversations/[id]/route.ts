import { getConversation } from '@/server/api/messages';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getConversation);
