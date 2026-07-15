import { finalizeMedia } from '@/server/api/media';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(finalizeMedia);
