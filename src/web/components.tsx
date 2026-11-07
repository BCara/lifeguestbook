import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link, navigate } from "./router";
import { useSession } from "./session";
import { api } from "./api";

export function Header({ minimal }: { minimal?: boolean }) {
  const { me } = useSession();
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden>♡</span> Life Guestbook
      </Link>
      {!minimal && (
        <nav>
          {!me && <Link to="/#products">Ways to use it</Link>}
          {me ? (
            <>
              <Link to="/dashboard">Your pages</Link>
              <button
                className="link"
                onClick={async () => {
                  await api.post("/auth/signout");
                  location.href = "/";
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/signin">Sign in</Link>
          )}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} Life Guestbook · Shared memories, never locked to one person.</p>
      <p className="footer-links">
        <Link to="/faq">Questions</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/cookies">Cookies</Link> · <Link to="/refunds">Refunds</Link> · <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a>
      </p>
    </footer>
  );
}

export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: "#2f2721", light: "#ffffff" } }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="QR code" className="qr" /> : <div style={{ width: size, height: size }} />;
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      {label && <span className="muted small">{label}</span>}
      <div className="row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button
          className="btn secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function RequireSignIn({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  useEffect(() => {
    if (!loading && !me) navigate(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`, true);
  }, [loading, me]);
  if (loading || !me) return <div className="page-center muted">Loading…</div>;
  return <>{children}</>;
}

export function lifeDates(born?: string, died?: string) {
  const y = (s?: string) => (s ? s.slice(0, 4) : "");
  if (!born && !died) return "";
  return `${y(born)}${died ? ` – ${y(died)}` : born ? " –" : ""}`;
}

export function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
