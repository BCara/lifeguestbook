import { initializeApp, type FirebaseOptions } from "@firebase/app";
import { browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth, inMemoryPersistence, signInWithPopup, signOut } from "@firebase/auth";

let configRequest: Promise<FirebaseOptions> | undefined;

export function loadGoogleSignIn() {
  configRequest ??= fetch("/__/firebase/init.json").then(async (response) => {
    if (!response.ok) throw new Error("Firebase configuration is unavailable.");
    const config = await response.json() as FirebaseOptions;
    if (!config.apiKey || !config.authDomain || !config.projectId) throw new Error("Firebase configuration is incomplete.");
    return config;
  }).catch((error: unknown) => {
    configRequest = undefined;
    throw error;
  });
  return configRequest.then((config) => {
    const auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return async () => {
      const credential = await signInWithPopup(auth, provider);
      try {
        return await credential.user.getIdToken();
      } finally {
        await signOut(auth).catch(() => undefined);
      }
    };
  });
}
