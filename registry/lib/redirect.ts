/**
 * Alleen interne, relatieve paden zijn toegestaan als redirect-doel.
 * Dit blokkeert open redirects zoals `//kwaadaardig.nl` of `https://...`.
 */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = '/leden',
): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  if (trimmed.includes('://')) return fallback;

  return trimmed;
}
