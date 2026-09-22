/**
 * Alleen interne, relatieve paden zijn toegestaan als redirect-doel.
 * Dit blokkeert open redirects zoals `//kwaadaardig.nl` of `https://...`.
 */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = '/leden',
): string {
  if (typeof value !== 'string') return fallback;

  // Browsers gooien tabs, newlines en andere stuurtekens weg vóórdat ze een
  // URL lezen. Zouden wij dat niet ook doen, dan glipt "/<tab>/kwaadaardig.nl"
  // langs de controle hieronder en wordt het in de browser alsnog
  // "//kwaadaardig.nl" — precies de externe redirect die we tegenhouden.
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();

  if (!cleaned.startsWith('/')) return fallback;
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\')) return fallback;
  if (cleaned.includes('://')) return fallback;
  if (cleaned.includes('\\')) return fallback;

  return cleaned;
}
