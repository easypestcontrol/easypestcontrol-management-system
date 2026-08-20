/* ============================================================================
   Who is allowed to do what.

   One place answers every role question, because the alternative is thirty
   `role === 'tech'` checks scattered through two apps — and the day a role is
   added, twenty-nine of them are right and one is not. That one is the bug you
   find in production.
   ========================================================================== */

export type Role = 'admin' | 'ops' | 'sales' | 'tech' | 'senior_tech' | 'accounts' | 'client';

/** Everyone who goes out and does the work. A senior technician still does services. */
export const FIELD_ROLES: Role[] = ['tech', 'senior_tech'];

/** Everyone who runs the office. */
export const OFFICE_ROLES: Role[] = ['admin', 'ops'];

/**
 * Is this a field technician? True for a senior technician too — seniority adds
 * the right to issue chemicals, it does not stop them working.
 */
export const isFieldTech = (role?: string | null): boolean =>
  role === 'tech' || role === 'senior_tech';

/**
 * May this person release chemicals from the store into someone's hands?
 * The senior technician exists precisely so the store is not blocked on an
 * admin being at a desk.
 */
export const canIssueStock = (role?: string | null): boolean =>
  role === 'admin' || role === 'ops' || role === 'senior_tech';

/** May this person see and change other people's work? */
export const isOffice = (role?: string | null): boolean =>
  role === 'admin' || role === 'ops';

/**
 * May this person record the work on a service?
 *
 * Only the head of the crew, and the office. Everyone else on the job gets
 * their trip and a read-only checklist. `headTechId` is authoritative: it is
 * set on every job that has a crew, so there is no implicit rule to remember.
 */
export function canRecordService(
  user: { id: string; role?: string | null } | null | undefined,
  job: { headTechId?: string | null; techIds?: string[] } | null | undefined,
): boolean {
  if (!user || !job) return false;
  if (isOffice(user.role)) return true;
  if (!isFieldTech(user.role)) return false;
  // Explicit head wins. A job with a crew but no head recorded is a data fault
  // and nobody gets write access until it is fixed — better than guessing.
  return !!job.headTechId && job.headTechId === user.id;
}

/** Is this person on the crew of that job at all — head or not? */
export function isOnCrew(
  user: { id: string } | null | undefined,
  job: { techIds?: string[] } | null | undefined,
): boolean {
  if (!user || !job) return false;
  return (job.techIds || []).includes(user.id);
}

/**
 * Where this person's day starts. Everyone lands on /dashboard, which shows a
 * technician his own day — wallet, chemicals, today's work, what he collects —
 * and the office the state of the business. One door, two rooms.
 *
 * Kept as a function rather than a constant because the answer has already
 * changed once, and when it changes again it should change in one place.
 */
export const homeFor = (_role?: string | null): string => '/dashboard';
