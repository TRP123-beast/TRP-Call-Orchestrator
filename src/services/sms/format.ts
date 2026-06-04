const COMPANY = process.env.COMPANY_NAME ?? 'Nestr Realty';
const SIGNATURE = `— ${COMPANY}`; // em dash + company

/**
 * Formats an outbound message professionally and signs it as the company.
 * Idempotent: skips signing if the body already references the company name.
 */
export function formatProfessional(body: string): string {
  const trimmed = body.trim();
  if (trimmed.toLowerCase().includes(COMPANY.toLowerCase())) {
    return trimmed;
  }
  return `${trimmed}\n${SIGNATURE}`;
}
