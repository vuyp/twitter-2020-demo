import { deleteDraft, updateDraft } from '@/server/api/drafts';
import { apiRoute } from '@/server/http';

export const PATCH = apiRoute(updateDraft);
export const DELETE = apiRoute(deleteDraft);
