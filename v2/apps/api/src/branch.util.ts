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
