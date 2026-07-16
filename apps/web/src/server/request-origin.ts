import {
  assessRequestOrigin,
  createRequestTrustedOrigins,
  type RequestOriginAssessment,
  type RequestOriginMetadata,
} from '@twitter2020/contracts/origins';
import { getServerEnv, getTrustedOrigins } from './env';

export type OriginSurface = 'auth' | 'rest';

function webRequestOriginMetadata(request: Request): RequestOriginMetadata {
  const headers = request.headers;
  return {
    origin: headers.get('origin'),
    requestUrl: request.url,
    host: headers.get('host'),
    forwardedHost: headers.get('x-forwarded-host'),
    forwardedProto: headers.get('x-forwarded-proto'),
  };
}

export function getTrustedOriginsForRequest(request?: Request): string[] {
  const configured = getTrustedOrigins(getServerEnv());
  return request
    ? createRequestTrustedOrigins(webRequestOriginMetadata(request), configured)
    : configured;
}

export function assessWebRequestOrigin(request: Request): RequestOriginAssessment {
  return assessRequestOrigin(webRequestOriginMetadata(request), getTrustedOrigins(getServerEnv()));
}

export function logRejectedRequestOrigin(
  request: Request,
  surface: OriginSurface,
  assessment = assessWebRequestOrigin(request),
  reason: string = assessment.reason,
): void {
  const headers = request.headers;
  let pathname = '/';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // A malformed request URL is still safe to report as the root path.
  }
  console.warn(
    JSON.stringify({
      level: 'warn',
      service: 'web',
      event: 'request.origin_rejected',
      surface,
      reason,
      method: request.method,
      pathname,
      origin: diagnosticHeader(headers.get('origin')),
      effectiveOrigin: assessment.effectiveOrigin,
      host: diagnosticHeader(headers.get('host')),
      forwardedHost: diagnosticHeader(headers.get('x-forwarded-host')),
      forwardedProto: diagnosticHeader(headers.get('x-forwarded-proto')),
      secFetchSite: diagnosticHeader(headers.get('sec-fetch-site')),
      requestId: diagnosticHeader(headers.get('x-request-id')),
      trustedOrigins: getTrustedOriginsForRequest(request),
    }),
  );
}

export function logUntrustedAuthOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
  const assessment = assessWebRequestOrigin(request);
  if (request.headers.get('origin') && !assessment.trusted) {
    logRejectedRequestOrigin(request, 'auth', assessment);
  }
}

function diagnosticHeader(value: string | null): string | null {
  return value ? value.slice(0, 512) : null;
}
