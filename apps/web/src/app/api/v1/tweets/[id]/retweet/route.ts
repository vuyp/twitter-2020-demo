import { addInteraction, removeInteraction } from '@/server/api/tweets';
import { apiRoute } from '@/server/http';
import type { RouteContext } from '@/server/http';
import type { NextRequest } from 'next/server';

export const POST = apiRoute((request: NextRequest, context: RouteContext<{ id: string }>) =>
  addInteraction(request, context, 'retweet'),
);
export const DELETE = apiRoute((request: NextRequest, context: RouteContext<{ id: string }>) =>
  removeInteraction(request, context, 'retweet'),
);
