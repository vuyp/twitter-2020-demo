import { followTopic, unfollowTopic } from '@/server/api/topics-moments';
import { apiRoute } from '@/server/http';

export const POST = apiRoute(followTopic);
export const DELETE = apiRoute(unfollowTopic);
