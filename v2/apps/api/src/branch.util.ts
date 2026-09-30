/* ============================================================================
   The branch wall. One company, several branches, one admin who sees all of
   it — everyone else sees only their own branch. Two jobs live here:

   1. The CHAIN — how a record learns its branch. The customer is the anchor
      (Client.branch, or inferred from the customer's area against each
      branch's `areas` list); documents stamp it at creation and carry it.

   2. The SCOPE — what a signed-in person may see. Admin: everything (null).
      Anyone else: exactly their User.branches. Every list endpoint filters
      by it; every detail endpoint 404s outside it. The `?branch=` filter the
      admin's dropdown sends is CLAMPED inside the scope, so a Madurai login
      asking for Chennai gets nothing — the wall never depends on the UI.
   ========================================================================== */
import type { PrismaClient } from '@prisma/client';

/** The branch a customer belongs to — explicit, or inferred from their area. */
export function inferBranch(
  area: string,
  branches: Array<{ id: string; areas: string[] }>,
): string {
  const a = (area || '').trim().toLowerCase();
  if (!a) return '';
  for (const b of branches) {
    if ((b.areas || []).some((x) => x.trim().toLowerCase() === a)) return b.id;
  }
  return '';
}

export async function clientBranch(prisma: PrismaClient, clientId: string): Promise<string> {
  if (!clientId) return '';
  const c = await prisma.client.findUnique({
    where: { id: clientId }, select: { branch: true, area: true },
  });
  if (!c) return '';
  if (c.branch) return c.branch;
  const branches = await prisma.branch.findMany({ select: { id: true, areas: true } });
  return inferBranch(c.area, branches);
}

/**
 * What this person may see. `null` = every branch (admin).
 * An empty array is a real answer: a person with no branch sees nothing —
 * the safe default until someone assigns them.
 */
export async function branchScope(
  prisma: PrismaClient,
  user: { sub?: string; role?: string } | undefined,
): Promise<string[] | null> {
  if (!user?.sub) return [];
  if (user.role === 'admin') return null;
  const u = await prisma.user.findUnique({
    where: { id: user.sub }, select: { branches: true },
  });
  return u?.branches || [];
}

/** The admin dropdown's ?branch= narrowed INTO the scope, never past it. */
export function clampScope(scope: string[] | null, want?: string): string[] | null {
  const w = (want || '').trim();
  if (!w) return scope;
  if (scope === null) return [w]; // admin narrows freely ('' rows via 'none')
  return scope.includes(w) ? [w] : ['__none__']; // outside scope → matches nothing
}

/** where-clause fragment for models carrying a `branch` column. */
export function branchWhere(scope: string[] | null): { branch?: { in: string[] } } {
  // Unstamped rows ('') stay admin-only: they appear when scope is null.
  return scope === null ? {} : { branch: { in: scope } };
}

/** Detail-endpoint check: may this scope see a row of this branch? */
export function inScope(scope: string[] | null, branch: string): boolean {
  return scope === null || scope.includes(branch || '');
}

/* ------------------------------------------------------- the sales book

   The customer book is already a shared sales asset (clients.controller):
   the whole office sees every customer. Leads, quotations and contracts are
   the same book one step earlier, and a salesperson works it wherever the
   enquiry comes from - a returning Chennai customer rings the Coimbatore
   number. So the SALES role sees the whole sales book; the branch stamp still
   routes the work, it just does not hide the record from the person selling.
   Ops stays a branch manager, walled as before.

   And whoever a record is assigned to can always open it, wherever it sits.
   Leads worked that way already; a quotation raised from such a lead
   inherits the lead's branch and used to answer "not found" to the very
   person who wrote it. */

/** Roles that see every branch's leads, quotations and contracts. */
export const SALES_BOOK = new Set(['admin', 'sales']);

/** The scope for the sales book: everything for the roles above, else the branch wall. */
export async function salesScope(
  prisma: PrismaClient,
  user: { sub?: string; role?: string } | undefined,
): Promise<string[] | null> {
  if (user?.role && SALES_BOOK.has(user.role)) return null;
  return branchScope(prisma, user);
}

/** In scope, or assigned to the person asking. */
export function inScopeOrMine(scope: string[] | null, branch: string, owner: string, me?: string): boolean {
  return inScope(scope, branch) || (!!me && !!owner && owner === me);
}

/** List fragment: rows in the person's branches, or owned by them. */
export function scopeOrMineWhere(scope: string[] | null, me?: string): Record<string, unknown> {
  if (scope === null) return {};
  return me ? { OR: [{ branch: { in: scope } }, { owner: me }] } : { branch: { in: scope } };
}
