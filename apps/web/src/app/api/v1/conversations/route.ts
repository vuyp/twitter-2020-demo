import { createConversation, getConversations } from '@/server/api/messages';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getConversations);
export const POST = apiRoute(createConversation);
