import { PRODUCTION_API_URL } from './api-config';

export function legalDocumentUrl(document: 'privacy' | 'terms'): string {
  return `${PRODUCTION_API_URL}/api/${document}`;
}