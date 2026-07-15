import { ZodError } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: Record<string, string[]> | undefined;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export function badRequest(message: string, code = 'bad_request'): never {
  throw new ApiError(400, code, message);
}

export function unauthorized(message = 'Sign in to continue'): never {
  throw new ApiError(401, 'unauthorized', message);
}

export function forbidden(message = 'You do not have permission to do that'): never {
  throw new ApiError(403, 'forbidden', message);
}

export function notFound(resource = 'Resource'): never {
  throw new ApiError(404, 'not_found', `${resource} was not found`);
}

export function conflict(message: string, code = 'conflict'): never {
  throw new ApiError(409, code, message);
}

export function rateLimited(retryAfterSeconds = 60): never {
  throw new ApiError(
    429,
    'rate_limited',
    `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
  );
}

export function zodErrors(error: ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'request';
    (output[key] ??= []).push(issue.message);
  }
  return output;
}
