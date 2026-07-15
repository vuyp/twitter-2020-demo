import { getNotifications, markNotificationsRead } from '@/server/api/discovery';
import { apiRoute } from '@/server/http';

export const GET = apiRoute(getNotifications);
export const PATCH = apiRoute(markNotificationsRead);
