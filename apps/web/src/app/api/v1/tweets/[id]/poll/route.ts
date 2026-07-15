import { votePoll } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(votePoll);
