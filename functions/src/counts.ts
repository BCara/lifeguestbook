import type { ContributionStatus } from "../../src/shared/types";
import { FieldValue, memorials } from "./db";

/** Keeps memorial.counts in step with contribution status changes. */
export function countDelta(from: ContributionStatus | null, to: ContributionStatus | null) {
  const d: Record<string, number> = {};
  const add = (s: ContributionStatus | null, n: number) => {
    if (s === "pending") d["counts.pending"] = (d["counts.pending"] ?? 0) + n;
    if (s === "approved") d["counts.approved"] = (d["counts.approved"] ?? 0) + n;
    if (s && s !== "rejected") d["counts.total"] = (d["counts.total"] ?? 0) + n;
  };
  add(from, -1);
  add(to, 1);
  return d;
}

export async function applyCountDelta(mid: string, from: ContributionStatus | null, to: ContributionStatus | null) {
  const d = countDelta(from, to);
  const update: Record<string, FirebaseFirestore.FieldValue> = {};
  for (const [k, v] of Object.entries(d)) if (v) update[k] = FieldValue.increment(v);
  if (Object.keys(update).length) await memorials().doc(mid).update(update);
}
