import { getAuth } from "firebase-admin/auth";

export function verifyGoogleSessionToken(idToken: string) {
  return getAuth().verifyIdToken(idToken, true);
}
