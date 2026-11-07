// Scheduled Firestore export to Cloud Storage (see docs/go-live-runbook.md, "Data safety").
// Uses the Firestore Admin REST API with the function's own service account token from the
// metadata server, so no extra dependency is needed. The export is asynchronous: this starts it
// and logs the operation name; progress shows in the console under Firestore > Import/Export.

const METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

/** Accepts "gs://bucket", "gs://bucket/prefix" or a bare bucket name; returns null when exports are off. */
export function exportTarget(setting: string, now: Date): string | null {
  const raw = setting.trim().replace(/\/+$/, "");
  if (!raw || raw === "none") return null;
  const base = raw.startsWith("gs://") ? raw : `gs://${raw}`;
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]{1,220}[a-z0-9](\/[\w.\/-]*)?$/.test(base)) throw new Error(`BACKUP_BUCKET is not a valid bucket: ${setting}`);
  return `${base}/firestore/${now.toISOString().replace(/[:.]/g, "-")}`;
}

export async function exportFirestore(project: string, setting: string, now = new Date(), fetchImpl: typeof fetch = fetch) {
  const outputUriPrefix = exportTarget(setting, now);
  if (!outputUriPrefix) {
    console.log("Firestore export skipped: BACKUP_BUCKET is not set.");
    return null;
  }
  const tokenRes = await fetchImpl(METADATA_TOKEN, { headers: { "Metadata-Flavor": "Google" } });
  if (!tokenRes.ok) throw new Error(`Could not get an access token (${tokenRes.status}).`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default):exportDocuments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ outputUriPrefix }),
  });
  const body = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Firestore export failed (${res.status}): ${body.error?.message ?? "unknown error"}`);
  console.log(`Firestore export started: ${body.name} -> ${outputUriPrefix}`);
  return { operation: body.name, outputUriPrefix };
}
