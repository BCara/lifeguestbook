import { describe, expect, it, vi } from "vitest";
import { exportFirestore, exportTarget } from "../functions/src/backup";

const now = new Date("2026-11-07T02:30:00.000Z");

describe("firestore export", () => {
  it("is off until a bucket is configured", async () => {
    expect(exportTarget("none", now)).toBeNull();
    expect(exportTarget("", now)).toBeNull();
    const fetchImpl = vi.fn();
    expect(await exportFirestore("p", "none", now, fetchImpl as any)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("builds a dated prefix and rejects junk", () => {
    expect(exportTarget("gs://lgb-backups/", now)).toBe("gs://lgb-backups/firestore/2026-11-07T02-30-00-000Z");
    expect(exportTarget("lgb-backups", now)).toBe("gs://lgb-backups/firestore/2026-11-07T02-30-00-000Z");
    expect(() => exportTarget("gs://Bad Bucket", now)).toThrow();
  });
  it("calls exportDocuments with the metadata token", async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes("metadata")
      ? new Response(JSON.stringify({ access_token: "tok" }))
      : new Response(JSON.stringify({ name: "projects/p/databases/(default)/operations/op1" })));
    const out = await exportFirestore("p", "gs://lgb-b", now, fetchImpl as any);
    expect(out?.operation).toContain("op1");
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://firestore.googleapis.com/v1/projects/p/databases/(default):exportDocuments");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ outputUriPrefix: "gs://lgb-b/firestore/2026-11-07T02-30-00-000Z" });
  });
  it("surfaces API errors", async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes("metadata")
      ? new Response(JSON.stringify({ access_token: "tok" }))
      : new Response(JSON.stringify({ error: { message: "denied" } }), { status: 403 }));
    await expect(exportFirestore("p", "gs://lgb-b", now, fetchImpl as any)).rejects.toThrow("denied");
  });
});
