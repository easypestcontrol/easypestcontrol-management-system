/* ============================================================================
   Dispatch helpers that live OUTSIDE the shared engine: mapping a job to the
   branch whose patch it sits in, and how many people a job wants on site.

   Ported 1:1 from v1 store.js — areaKey/branchForArea (153-190), clientBranch
   (552-561), jobBranch (564-568), jobCrewSize (703-712). They read org data
   (branches, contracts, clients) rather than the day's roster, which is why
   they are not part of packages/shared.
   ========================================================================== */

export interface BranchLite {
  id: string;
  name: string;
  areas: string[];
}

export interface ClientLite {
  id: string;
  name: string;
  addr: string;
  city: string;
  branch: string;
}

export interface PlanLineLite {
  contractId: string;
  svId: string;
  crew: number;
}

export interface JobCrewLite {
  contractId: string;
  serviceIds: string[];
  techIds: string[];
}

/** Loose text key so "besant nagar" matches "Besant Nagar, Chennai". */
export function areaKey(v: unknown): string {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Which branch looks after this locality. The branch's own area list first
 * (exact key, then substring either direction), then the branch name, so a
 * locality nobody has listed yet still finds its office. v2's Branch model
 * has no street address, so v1's addr fallback collapses into the name check.
 */
export function branchForArea(area: string, branches: BranchLite[]): BranchLite | null {
  const k = areaKey(area);
  if (!k) return null;

  let hit = branches.find((b) => (b.areas || []).some((a) => areaKey(a) === k));
  if (hit) return hit;

  hit = branches.find((b) => (b.areas || []).some((a) => {
    const ak = areaKey(a);
    return !!ak && (ak.indexOf(k) >= 0 || k.indexOf(ak) >= 0);
  }));
  if (hit) return hit;

  return branches.find((b) => {
    const nk = areaKey(b.name);
    return !!nk && nk.indexOf(k) >= 0;
  }) || null;
}

/**
 * The branch this customer belongs to. An explicit choice wins outright —
 * even a dangling id stops the walk, exactly as v1 did — otherwise the
 * address segments are walked LAST to FIRST (localities sit at the end of an
 * Indian address), and failing everything, the first branch.
 */
export function clientBranch(
  cl: ClientLite | null | undefined, branches: BranchLite[],
): BranchLite | null {
  if (!cl) return null;
  if (cl.branch) return branches.find((b) => b.id === cl.branch) || null;
  const parts = ((cl.addr || '') + ', ' + (cl.city || '')).split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = branchForArea(parts[i], branches);
    if (hit) return hit;
  }
  return branches[0] || null;
}

/** The branch a job belongs to: its contract's branch, else its customer's. */
export function jobBranch(
  contractBranchId: string,
  client: ClientLite | null | undefined,
  branches: BranchLite[],
): BranchLite | null {
  if (contractBranchId) return branches.find((b) => b.id === contractBranchId) || null;
  return clientBranch(client, branches);
}

/**
 * How many people a job wants on site at once — the MAX crew across the plan
 * lines behind its services (services sharing a trip share one crew). A job
 * with no contract answers with whoever is already on it; a contract with no
 * matching plan (or a dangling contract) answers 1.
 */
export function jobCrewSize(job: JobCrewLite, lines: PlanLineLite[] = []): number {
  if (!job.contractId) return Math.max(1, (job.techIds || []).length);
  let n = 1;
  for (const l of lines) {
    if (l.contractId === job.contractId && (job.serviceIds || []).indexOf(l.svId) >= 0) {
      n = Math.max(n, l.crew || 1);
    }
  }
  return n;
}
