import { presignMedia } from '@/server/api/media';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(presignMedia);
