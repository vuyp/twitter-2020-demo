import { updateReport } from '@/server/api/settings-reports';
import { apiRoute } from '@/server/http';

export const PATCH = apiRoute(updateReport);
