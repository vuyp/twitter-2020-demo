import { markConversationRead } from '@/server/api/messages';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(markConversationRead);
