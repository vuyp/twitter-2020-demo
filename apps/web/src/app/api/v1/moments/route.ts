import { createMoment, getMoments } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getMoments);
export const POST = apiRoute(createMoment);
