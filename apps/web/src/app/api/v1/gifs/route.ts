import { ApiError } from '@/server/errors';
import { apiRoute, ok } from '@/server/http';
import { requireSession } from '@/server/session';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyItem = {
  id?: string;
  title?: string;
  images?: {
    fixed_width?: GiphyImage;
    fixed_width_small_still?: GiphyImage;
    downsized?: GiphyImage;
  };
};

export const GET = apiRoute(async (request: NextRequest) => {
  await requireSession(request);
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'giphy_not_configured', 'GIF search is not configured');
  }
  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 50) ?? '';
  const endpoint = query
    ? 'https://api.giphy.com/v1/gifs/search'
    : 'https://api.giphy.com/v1/gifs/trending';
  const url = new URL(endpoint);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('limit', '24');
  url.searchParams.set('rating', 'pg-13');
  if (query) url.searchParams.set('q', query);

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new ApiError(502, 'giphy_unavailable', 'GIF search is temporarily unavailable');
  }
  const payload = (await response.json()) as { data?: GiphyItem[] };
  return ok({
    items: (payload.data ?? []).flatMap((item) => {
      const preview = item.images?.fixed_width?.url;
      const url = item.images?.downsized?.url || preview;
      if (!item.id || !preview || !url) return [];
      return [
        {
          id: item.id,
          title: item.title || 'GIF',
          previewUrl: preview,
          url,
          width: Number(item.images?.fixed_width?.width) || null,
          height: Number(item.images?.fixed_width?.height) || null,
        },
      ];
    }),
  });
});
