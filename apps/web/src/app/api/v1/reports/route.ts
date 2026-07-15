import { createReport, listReports } from '@/server/api/settings-reports';
import { apiRoute } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = apiRoute(listReports);
export const POST = apiRoute(createReport);
