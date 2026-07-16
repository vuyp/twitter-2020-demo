function requireHttpUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Trusted origins must be HTTP(S) URLs without credentials');
  }
  return parsed;
}

export function normalizeHttpOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Trusted origins must be non-empty URLs');
  }
  return requireHttpUrl(value.trim()).origin;
}

export function normalizeOriginHeader(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value) return null;
  try {
    const parsed = requireHttpUrl(value);
    return parsed.origin === value ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function createTrustedOrigins(appUrl, additionalOrigins = []) {
  const additional = Array.isArray(additionalOrigins)
    ? additionalOrigins
    : additionalOrigins.split(',');
  return [
    ...new Set(
      [appUrl, ...additional]
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeHttpOrigin),
    ),
  ];
}

export function isTrustedOrigin(value, trustedOrigins) {
  const normalized = normalizeOriginHeader(value);
  return normalized !== null && trustedOrigins.includes(normalized);
}

function singleHeaderValue(value) {
  if (typeof value !== 'string') return null;
  if (value.includes(',')) return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeForwardedProtocol(value) {
  const protocol = singleHeaderValue(value)?.toLowerCase();
  return protocol === 'http' || protocol === 'https' ? protocol : null;
}

function originFromHost(protocol, value) {
  const host = singleHeaderValue(value);
  if (!protocol || !host || /[\s\\/@?#]/.test(host)) return null;
  try {
    const parsed = requireHttpUrl(`${protocol}://${host}`);
    return parsed.pathname === '/' && parsed.host.toLowerCase() === host.toLowerCase()
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function originFromRequestUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return requireHttpUrl(value).origin;
  } catch {
    return null;
  }
}

function trustedOriginFromHost(value, allowed) {
  const host = singleHeaderValue(value);
  if (!host || /[\s\\/@?#]/.test(host)) return null;
  let normalizedHost;
  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.pathname !== '/' || parsed.host.toLowerCase() !== host.toLowerCase()) return null;
    normalizedHost = parsed.host;
  } catch {
    return null;
  }
  const matches = [...allowed].filter((origin) => new URL(origin).host === normalizedHost);
  return matches.length === 1 ? matches[0] : null;
}

export function getRequestOriginCandidates(metadata) {
  const requestOrigin = originFromRequestUrl(metadata.requestUrl);
  const forwardedProtocol = normalizeForwardedProtocol(metadata.forwardedProto);
  const requestProtocol = requestOrigin ? new URL(requestOrigin).protocol.slice(0, -1) : null;
  return [
    ...new Set(
      [
        originFromHost(forwardedProtocol, metadata.forwardedHost),
        originFromHost(forwardedProtocol, metadata.host),
        originFromHost(requestProtocol, metadata.forwardedHost),
        originFromHost(requestProtocol, metadata.host),
        requestOrigin,
      ].filter((candidate) => candidate !== null),
    ),
  ];
}

export function createRequestTrustedOrigins(metadata, trustedOrigins) {
  return [
    ...new Set([
      ...trustedOrigins.map(normalizeHttpOrigin),
      ...getRequestOriginCandidates(metadata),
    ]),
  ];
}

export function getEffectiveRequestOrigin(metadata, trustedOrigins) {
  const allowed = new Set(trustedOrigins.map(normalizeHttpOrigin));
  const candidates = getRequestOriginCandidates(metadata);
  const requestOrigin = normalizeOriginHeader(metadata.origin);
  if (requestOrigin && candidates.includes(requestOrigin)) return requestOrigin;
  const configuredCandidate = candidates.find((candidate) => allowed.has(candidate));
  if (configuredCandidate) return configuredCandidate;
  return (
    trustedOriginFromHost(metadata.forwardedHost, allowed) ??
    trustedOriginFromHost(metadata.host, allowed)
  );
}

export function assessRequestOrigin(metadata, trustedOrigins) {
  const origin = normalizeOriginHeader(metadata.origin);
  const effectiveOrigin = getEffectiveRequestOrigin(metadata, trustedOrigins);
  if (metadata.origin === null || metadata.origin === undefined || metadata.origin === '') {
    return { origin: null, effectiveOrigin, trusted: false, reason: 'missing' };
  }
  if (!origin) return { origin: null, effectiveOrigin, trusted: false, reason: 'malformed' };
  if (!createRequestTrustedOrigins(metadata, trustedOrigins).includes(origin)) {
    return { origin, effectiveOrigin, trusted: false, reason: 'untrusted' };
  }
  return { origin, effectiveOrigin, trusted: true, reason: 'trusted' };
}
