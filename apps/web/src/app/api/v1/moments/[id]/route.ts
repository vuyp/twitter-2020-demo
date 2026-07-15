import { deleteMoment, getMoment, updateMoment } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getMoment);
export const PATCH = apiRoute(updateMoment);
export const DELETE = apiRoute(deleteMoment);
