export function legalDocumentUrl(document: 'privacy' | 'terms'): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) {
    throw new Error('EXPO_PUBLIC_DOMAIN is required for legal document links');
  }
  return `https://${domain}/api/${document}`;
}