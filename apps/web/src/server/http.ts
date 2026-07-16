import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { ZodError } from 'zod';
import { ApiError, zodErrors } from './errors';
import { assessWebRequestOrigin, logRejectedRequestOrigin } from './request-origin';

export type RouteContext<T extends Record<string, string> = Record<string, string>> = {
  params: Promise<T>;
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T): NextResponse<{ data: T }> {
  return ok(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  return schema.parse(input);
}

export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const all = request.nextUrl.searchParams.getAll(key);
    values[key] = all.length > 1 ? all : (all[0] ?? '');
  }
  return schema.parse(values);
}

export function apiRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args) => {
    try {
      assertSameOriginMutation(args[0]);
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return problem(
          new ApiError(
            422,
            'validation_error',
            'The request could not be validated',
            zodErrors(error),
          ),
        );
      }
      if (error instanceof ApiError) return problem(error);

      const cause = error as { code?: string; constraint?: string };
      if (cause.code === '23505') {
        return problem(new ApiError(409, 'already_exists', 'That record already exists'));
      }
      if (cause.code === '23503') {
        return problem(
          new ApiError(422, 'invalid_reference', 'A referenced record does not exist'),
        );
      }
      if (cause.code === '22P02') {
        return problem(
          new ApiError(400, 'invalid_identifier', 'An identifier or typed value is invalid'),
        );
      }
      if (cause.code === '23514') {
        return problem(
          new ApiError(422, 'constraint_violation', 'The requested values violate a domain rule'),
        );
      }

      console.error('Unhandled API error', error);
      return problem(new ApiError(500, 'internal_error', 'Something went wrong'));
    }
  };
}

function assertSameOriginMutation(value: unknown): void {
  if (
    !(value instanceof Request) ||
    ['GET', 'HEAD', 'OPTIONS'].includes(value.method.toUpperCase())
  )
    return;
  const fetchSite = value.headers.get('sec-fetch-site');
  const assessment = assessWebRequestOrigin(value);
  if (fetchSite === 'cross-site') {
    logRejectedRequestOrigin(value, 'rest', assessment, 'cross-site');
    throw new ApiError(403, 'csrf_rejected', 'Cross-site mutation requests are not allowed');
  }
  const origin = value.headers.get('origin');
  if (!origin) return;
  if (!assessment.trusted) {
    logRejectedRequestOrigin(value, 'rest', assessment);
    throw new ApiError(403, 'csrf_rejected', 'The request origin is not trusted');
  }
}

function problem(error: ApiError): NextResponse {
  const body = {
    type: `https://twitter.local/problems/${error.code}`,
    title: statusTitle(error.status),
    status: error.status,
    detail: error.message,
    code: error.code,
    ...(error.errors ? { errors: error.errors } : {}),
  };
  return NextResponse.json(body, {
    status: error.status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function statusTitle(status: number): string {
  return (
    {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      413: 'Payload Too Large',
      415: 'Unsupported Media Type',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
    }[status] ?? 'Request Failed'
  );
}
