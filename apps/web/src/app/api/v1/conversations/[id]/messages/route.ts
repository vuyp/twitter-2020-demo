import { getMessages, sendMessage } from '@/server/api/messages';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getMessages);
export const POST = apiRoute(sendMessage);
