const STABLE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** Fork releases must never advertise the upstream package as an app upgrade. */
export function shouldCheckUpstreamUpdate(version: string): boolean {
  return STABLE_VERSION_PATTERN.test(version);
}

function parseStableVersion(version: string): [number, number, number] | null {
  const match = STABLE_VERSION_PATTERN.exec(version);
  if (!match) return null;

  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return parts as [number, number, number];
}

export function isNewerStableVersion(candidate: string, current: string): boolean {
  const candidateParts = parseStableVersion(candidate);
  const currentParts = parseStableVersion(current);
  if (!candidateParts || !currentParts) return false;

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index];
    }
  }
  return false;
}

export function getPiWebReleaseUrl(version: string): string | null {
  if (!parseStableVersion(version)) return null;
  return `https://github.com/agegr/pi-web/releases/tag/v${version}`;
}
