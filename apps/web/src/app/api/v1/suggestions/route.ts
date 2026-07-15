import { getSuggestions } from '@/server/api/discovery';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getSuggestions);
