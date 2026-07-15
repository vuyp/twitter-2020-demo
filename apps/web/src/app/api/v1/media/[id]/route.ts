import { getMediaStatus } from '@/server/api/media';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getMediaStatus);
