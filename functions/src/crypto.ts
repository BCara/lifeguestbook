import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const shortId = () => randomBytes(4).toString("hex").slice(0, 6);
export const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("base64url");
export const timingSafeEqualStr = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
