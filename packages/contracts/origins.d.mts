export type RequestOriginMetadata = {
  origin?: string | null;
  requestUrl?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
};

export type RequestOriginAssessment = {
  origin: string | null;
  effectiveOrigin: string | null;
  trusted: boolean;
  reason: 'trusted' | 'missing' | 'malformed' | 'untrusted';
};

export declare function normalizeHttpOrigin(value: string): string;

export declare function normalizeOriginHeader(value: unknown): string | null;

export declare function createTrustedOrigins(
  appUrl: string,
  additionalOrigins?: string | ReadonlyArray<string>,
): string[];

export declare function isTrustedOrigin(
  value: unknown,
  trustedOrigins: ReadonlyArray<string>,
): boolean;

export declare function getRequestOriginCandidates(metadata: RequestOriginMetadata): string[];

export declare function createRequestTrustedOrigins(
  metadata: RequestOriginMetadata,
  trustedOrigins: ReadonlyArray<string>,
): string[];

export declare function getEffectiveRequestOrigin(
  metadata: RequestOriginMetadata,
  trustedOrigins: ReadonlyArray<string>,
): string | null;

export declare function assessRequestOrigin(
  metadata: RequestOriginMetadata,
  trustedOrigins: ReadonlyArray<string>,
): RequestOriginAssessment;
