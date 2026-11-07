import { analyticsConfigured, openCookieSettings } from "./analytics";

/** Footer link that reopens the consent banner. Hidden while analytics isn't configured. */
export function CookieSettingsLink({ className }: { className?: string }) {
  if (!analyticsConfigured) return null;
  return (
    <button type="button" className={className ?? "link"} onClick={openCookieSettings}>
      Cookie settings
    </button>
  );
}
