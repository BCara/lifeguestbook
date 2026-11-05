import { useCallback, useEffect, useMemo, useState } from "react";
import { currencyForTimeZone, formatPrice, type Currency, type Product } from "../../shared/pricing";
import { isFrozen } from "../../shared/plans";
import { can, ROLE_LABELS, type Role } from "../../shared/roles";
import type { ContributionView, InviteView, MemberView, MemorialAdmin } from "../../shared/types";
import { api, ApiError } from "../api";
import { CopyField, Header, lifeDates, QrImage, RequireSignIn, timeAgo } from "../components";
import { Link, navigate, query } from "../router";
import { useSession } from "../session";

type Tab = "review" | "memories" | "people" | "share" | "dayof" | "plan" | "settings";

export function Manage({ id }: { id: string }) {
  return (
    <RequireSignIn>
      <ManageInner id={id} />
    </RequireSignIn>
  );
}

function ManageInner({ id }: { id: string }) {
  const [m, setM] = useState<MemorialAdmin>();
  const [pendingTransfer, setPendingTransfer] = useState<{ toUid: string } | null>(null);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>((query(location.search, "tab") as Tab) ?? "review");
  const { me } = useSession();
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ memorial: MemorialAdmin; pendingTransfer: { toUid: string } | null }>(`/memorials/${id}`);
      setM(r.memorial);
      setPendingTransfer(r.pendingTransfer);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this page.");
    }
  }, [id]);
  useEffect(() => {
    const paid = query(location.search, "paid");
    (paid ? api.post("/payments/confirm", { sessionId: paid }).catch(() => undefined) : Promise.resolve()).then(load);
  }, [load]);
  if (error) return (<><Header /><main className="narrow"><p className="error">{error}</p><Link to="/dashboard">Back to your pages</Link></main></>);
  if (!m) return <div className="page-center muted">Loading…</div>;
  const welcome = query(location.search, "welcome");
  const tabs: [Tab, string, boolean][] = [
    ["review", `Review${m.counts.pending ? ` (${m.counts.pending})` : ""}`, true],
    ["memories", "Memories", true],
    ["people", "People", true],
    ["share", "Share", true],
    ["dayof", "On the day", true],
    ["plan", "Plan", can(m.role, "billing")],
    ["settings", "Settings", can(m.role, "manage_settings")],
  ];
  return (
    <>
      <Header />
      <main className="wide">
        <div className="manage-head">
          <div>
            <p className="muted small"><Link to="/dashboard">Your pages</Link> / {ROLE_LABELS[m.role]}</p>
            <h1>{m.name}</h1>
            <p className="muted">{lifeDates(m.born, m.died)} {m.mode === "living" && "· Living Legacy"}</p>
          </div>
          <Link to={`/m/${m.slug}`} className="btn secondary">View page</Link>
        </div>
        {welcome && (
          <div className="notice">
            Your page is ready. Next: <button className="link" onClick={() => setTab("share")}>share the link</button>, and <button className="link" onClick={() => setTab("people")}>invite a co-admin</button> so it's never just on you.
          </div>
        )}
        {pendingTransfer && me && pendingTransfer.toUid === me.uid && (
          <div className="notice">
            You've been asked to become the owner of this page.{" "}
            <button className="btn small" onClick={async () => { await api.post(`/memorials/${id}/transfer/accept`); load(); }}>Accept ownership</button>{" "}
            <button className="link" onClick={async () => { await api.post(`/memorials/${id}/transfer/cancel`); load(); }}>Decline</button>
          </div>
        )}
        {m.frozen && (
          <div className="notice warn">Hosting has lapsed, so the page is read-only. Nothing has been deleted. <button className="link" onClick={() => setTab("plan")}>Renew to reopen it</button>.</div>
        )}
        <nav className="tabs">
          {tabs.filter((t) => t[2]).map(([key, label]) => (
            <button key={key} ref={(el) => { if (tab === key && el) el.parentElement?.scrollTo({ left: el.offsetLeft - 24 }); }} className={tab === key ? "on" : ""} onClick={() => { setTab(key); history.replaceState(null, "", `?tab=${key}`); }}>
              {label}
            </button>
          ))}
        </nav>
        {tab === "review" && <Review m={m} onChange={load} status="pending" />}
        {tab === "memories" && <Review m={m} onChange={load} status="all" />}
        {tab === "people" && <People m={m} onChange={load} />}
        {tab === "share" && <Share m={m} />}
        {tab === "dayof" && <DayOf m={m} onChange={load} />}
        {tab === "plan" && <Plan m={m} onChange={load} />}
        {tab === "settings" && <Settings m={m} onChange={load} />}
      </main>
    </>
  );
}

function Review({ m, onChange, status }: { m: MemorialAdmin; onChange: () => void; status: "pending" | "all" }) {
  const [items, setItems] = useState<ContributionView[]>();
  const [filter, setFilter] = useState<string>(status === "pending" ? "pending" : "approved");
  const load = useCallback(() => {
    api.get<{ contributions: ContributionView[] }>(`/memorials/${m.id}/contributions?status=${filter}`).then((r) => setItems(r.contributions));
  }, [m.id, filter]);
  useEffect(load, [load]);
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(load, 10_000); // keep the queue fresh on the day
    return () => clearInterval(t);
  }, [load, status]);
  const act = async (cid: string, action: string) => {
    await api.post(`/memorials/${m.id}/contributions/${cid}`, { action });
    setItems((xs) => xs?.filter((x) => x.id !== cid));
    onChange();
  };
  return (
    <section>
      {status === "all" && (
        <div className="segmented">
          {["approved", "hidden", "rejected"].map((s) => (
            <button key={s} className={filter === s ? "on" : ""} onClick={() => setFilter(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      )}
      {status === "pending" && items && items.length > 1 && (
        <p>
          <button className="btn secondary small" onClick={async () => { await api.post(`/memorials/${m.id}/contributions-bulk`); load(); onChange(); }}>
            Approve everything our screening didn't flag
          </button>
        </p>
      )}
      {!items ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <div className="card empty">{status === "pending" ? "Nothing waiting. New memories will appear here, and we'll email you a summary." : "Nothing here yet."}</div>
      ) : (
        <div className="review-list">
          {items.map((c) => (
            <article key={c.id} className="card review-item">
              <Media c={c} />
              <div className="review-body">
                <p className="small"><strong>{c.authorName}</strong>{c.relation && ` · ${c.relation}`}{c.era && ` · ${c.era}`} · <span className="muted">{timeAgo(c.createdAt)}{c.source === "event" ? " · at the service" : ""}</span></p>
                {c.text && <p className="memory-text">{c.text}</p>}
                {c.screening && c.screening.outcome !== "clear" && (
                  <p className="flag">Screening: {c.screening.outcome}{c.screening.categories ? ` (${c.screening.categories.join(", ")})` : ""}</p>
                )}
                <div className="row gap wrap">
                  {c.status !== "approved" && <button className="btn small" onClick={() => act(c.id, "approve")}>Approve</button>}
                  {c.status !== "hidden" && <button className="btn secondary small" onClick={() => act(c.id, "hide")}>Hide</button>}
                  {c.status !== "rejected" && <button className="btn ghost small" onClick={() => act(c.id, "reject")}>Reject</button>}
                  {c.text && <EditText m={m} c={c} onSaved={load} />}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EditText({ m, c, onSaved }: { m: MemorialAdmin; c: ContributionView; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(c.text ?? "");
  if (!open) return <button className="link small" onClick={() => setOpen(true)}>Edit text</button>;
  return (
    <div className="stack grow">
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row gap">
        <button className="btn small" onClick={async () => { await api.post(`/memorials/${m.id}/contributions/${c.id}`, { text }); setOpen(false); onSaved(); }}>Save</button>
        <button className="link small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function Media({ c, full }: { c: ContributionView; full?: boolean }) {
  if (!c.mediaUrl) return null;
  if (c.type === "photo") return <img className="media" src={full ? c.mediaUrl : c.thumbUrl} alt={`Shared by ${c.authorName}`} loading="lazy" />;
  if (c.type === "video") return <video className="media" src={c.mediaUrl} controls preload="metadata" playsInline />;
  if (c.type === "voice") return <audio className="media-audio" src={c.mediaUrl} controls preload="none" />;
  return null;
}

function People({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const [data, setData] = useState<{ members: MemberView[]; invites: InviteView[] }>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [msg, setMsg] = useState<string>();
  const [devLink, setDevLink] = useState<string>();
  const { me } = useSession();
  const load = useCallback(() => void api.get<{ members: MemberView[]; invites: InviteView[] }>(`/memorials/${m.id}/members`).then(setData), [m.id]);
  useEffect(load, [load]);
  const admins = data?.members.filter((x) => x.role === "owner" || x.role === "admin").length ?? 0;
  return (
    <section className="stack">
      {admins < 2 && <div className="notice">Add at least one more admin, so the page is never locked to a single email address.</div>}
      <div className="card">
        <h3>People who look after this page</h3>
        <table className="table">
          <tbody>
            {data?.members.map((x) => (
              <tr key={x.uid}>
                <td>{x.email}{x.uid === me?.uid && <span className="muted"> (you)</span>}</td>
                <td>
                  {can(m.role, "manage_members") && x.role !== "owner" && x.uid !== me?.uid ? (
                    <select value={x.role} onChange={async (e) => { await api.post(`/memorials/${m.id}/members/${x.uid}`, { role: e.target.value }).catch((er) => alert(er.message)); load(); }}>
                      {(["admin", "moderator", "trusted"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : ROLE_LABELS[x.role]}
                </td>
                <td className="right">
                  {x.role !== "owner" && (can(m.role, "manage_members") || x.uid === me?.uid) && (
                    <button className="link small" onClick={async () => {
                      if (!confirm(x.uid === me?.uid ? "Leave this page?" : `Remove ${x.email}?`)) return;
                      await api.del(`/memorials/${m.id}/members/${x.uid}`).catch((er) => alert(er.message));
                      if (x.uid === me?.uid) navigate("/dashboard"); else load();
                    }}>{x.uid === me?.uid ? "Leave" : "Remove"}</button>
                  )}
                  {m.role === "owner" && x.role === "admin" && (
                    <button className="link small" onClick={async () => {
                      if (!confirm(`Ask ${x.email} to become the owner? You'll stay on as an admin.`)) return;
                      await api.post(`/memorials/${m.id}/transfer`, { uid: x.uid });
                      setMsg(`We've asked ${x.email} to accept ownership.`);
                      onChange();
                    }}>Make owner</button>
                  )}
                </td>
              </tr>
            ))}
            {data?.invites.map((i) => (
              <tr key={i.id} className="muted">
                <td>{i.email} (invited)</td>
                <td>{ROLE_LABELS[i.role]}</td>
                <td className="right"><button className="link small" onClick={async () => { await api.del(`/memorials/${m.id}/invites/${i.id}`); load(); }}>Cancel</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {can(m.role, "manage_members") && (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault();
          setMsg(undefined);
          try {
            const r = await api.post<{ devLink?: string }>(`/memorials/${m.id}/invites`, { email, role });
            setDevLink(r.devLink);
            setMsg(`Invitation sent to ${email}.`);
            setEmail("");
            load();
          } catch (err) {
            setMsg(err instanceof ApiError ? err.message : "Couldn't send the invitation.");
          }
        }}>
          <h3>Invite someone</h3>
          <div className="row gap wrap">
            <input className="grow" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">Admin: full access</option>
              <option value="moderator">Moderator: review and slideshow only</option>
              <option value="trusted">Trusted family: posts skip review</option>
            </select>
            <button className="btn">Send invite</button>
          </div>
          {msg && <p className="small">{msg}</p>}
          {devLink && <p className="dev small">Local test: <a href={devLink}>invitation link</a></p>}
        </form>
      )}
      {m.role === "owner" && <p className="muted small">If you ever step back, use "Make owner" to hand the page to another admin. Admins keep full access to photos, stories and moderation either way.</p>}
    </section>
  );
}

function Share({ m }: { m: MemorialAdmin }) {
  const url = `${location.origin}/m/${m.slug}`;
  const addUrl = `${url}/add`;
  const post = `${m.mode === "living" ? `We're gathering stories and photos of ${m.name}.` : `We're collecting memories of ${m.name}${m.service?.date ? ` ahead of the service on ${new Date(m.service.date).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : ""}.`} If you have a photo or a story, especially ones the family might never have seen, please add it here. No app or account needed:\n${addUrl}`;
  return (
    <section className="stack">
      <div className="card stack">
        <h3>Your link</h3>
        <CopyField value={url} label="The page" />
        <CopyField value={addUrl} label="Straight to 'add a memory'" />
      </div>
      <div className="card stack">
        <h3>Ready-to-post message</h3>
        <p className="muted small">For Facebook, WhatsApp, group chats and email. Old school and work friends often have the photos nobody else does.</p>
        <textarea readOnly rows={5} value={post} />
        <div className="row gap wrap">
          <button className="btn secondary small" onClick={() => navigator.clipboard.writeText(post)}>Copy message</button>
          <a className="btn secondary small" href={`https://wa.me/?text=${encodeURIComponent(post)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="btn secondary small" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Facebook</a>
          <a className="btn secondary small" href={`mailto:?subject=${encodeURIComponent(`Memories of ${m.name}`)}&body=${encodeURIComponent(post)}`}>Email</a>
          {"share" in navigator && <button className="btn secondary small" onClick={() => navigator.share({ title: m.name, text: post })}>More…</button>}
        </div>
      </div>
      <div className="card row gap wrap">
        <QrImage value={`${addUrl}?src=qr`} size={160} />
        <div className="stack">
          <h3>QR code</h3>
          <p className="muted small">For tables, the order of service and the guestbook stand.</p>
          <Link to={`/dashboard/${m.id}/print`} className="btn secondary small">Print QR cards and posters</Link>
        </div>
      </div>
    </section>
  );
}

function DayOf({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const wallUrl = `${location.origin}/wall?k=${m.wallKey}`;
  const ctl = (body: object) => api.post(`/memorials/${m.id}/wall`, body).then(onChange);
  return (
    <section className="stack">
      {!m.allowance.slideshow ? (
        <div className="card"><h3>Live slideshow</h3><p>The live slideshow is part of Tribute. Upgrade on the Plan tab to show approved memories on a screen at the service.</p></div>
      ) : (
        <>
          <div className="card stack">
            <h3>Live slideshow</h3>
            <p className="muted small">Open this on the venue laptop or smart TV. It shows approved memories only, and new ones appear within seconds of approval.</p>
            <CopyField value={wallUrl} />
            <div className="row gap wrap">
              <a className="btn small" href={wallUrl} target="_blank" rel="noreferrer">Open slideshow</a>
              {can(m.role, "manage_settings") && <button className="btn ghost small" onClick={async () => { if (confirm("Make a new slideshow link? The old one will stop working.")) { await api.post(`/memorials/${m.id}/wall/rotate`); onChange(); } }}>New link</button>}
            </div>
          </div>
          <div className="card stack">
            <h3>Remote control</h3>
            <p className="muted small">Use this from your phone during the service.</p>
            <div className="row gap wrap">
              <button className="btn secondary" onClick={() => ctl({ paused: true })}>Pause</button>
              <button className="btn secondary" onClick={() => ctl({ paused: false, pinnedId: null })}>Play</button>
              <button className="btn secondary" onClick={() => ctl({ skip: true })}>Next</button>
            </div>
          </div>
        </>
      )}
      <div className="card stack">
        <h3>Notifications on the day</h3>
        <label className="row gap">
          <input type="checkbox" checked={m.notifyMode === "instant"} onChange={(e) => api.patch(`/memorials/${m.id}`, { notifyMode: e.target.checked ? "instant" : "digest" }).then(onChange)} />
          Email admins every few minutes while memories are waiting (we switch this on automatically the day before the service)
        </label>
      </div>
    </section>
  );
}

function Plan({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const cur = useMemo<Currency>(() => currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [busy, setBusy] = useState<Product>();
  const buy = async (product: Product) => {
    setBusy(product);
    try {
      const r = await api.post<{ url?: string; applied?: boolean }>("/payments/checkout", { memorialId: m.id, product, currency: cur });
      if (r.url) location.href = r.url;
      else onChange();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Payment couldn't start.");
    } finally {
      setBusy(undefined);
    }
  };
  const until = m.plan.hostingUntil ? new Date(m.plan.hostingUntil).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <section className="stack">
      <div className="card">
        <h3>Current plan: {m.plan.tier === "free" ? "Free" : m.plan.tier === "forever" ? "Forever" : m.plan.tier === "living" ? "Living Legacy" : "Tribute"}</h3>
        {m.plan.tier === "free" && <p>{m.counts.total} of {m.allowance.contributionLimit} memories used.</p>}
        {until && <p>{isFrozen(m.plan) ? `Hosting lapsed on ${until}. The page is read-only until renewed.` : `Hosting paid until ${until}.`}</p>}
        {m.plan.tier === "forever" && <p>Hosted for life. Nothing to renew.</p>}
      </div>
      <div className="plans">
        {m.plan.tier === "free" && m.mode === "memorial" && (
          <div className="plan featured">
            <h3>Tribute</h3>
            <p className="price">{formatPrice("tribute", cur)}</p>
            <p className="small">Unlimited memories, video and voice, live slideshow, unlimited admins. 2 years of hosting included.</p>
            <button className="btn" disabled={!!busy} onClick={() => buy("tribute")}>{busy === "tribute" ? "…" : "Upgrade"}</button>
          </div>
        )}
        {m.plan.tier === "free" && m.mode === "living" && (
          <div className="plan featured">
            <h3>Living Legacy</h3>
            <p className="price">{formatPrice("living", cur)}</p>
            <p className="small">Everything in Tribute while they're with us. Becomes their memorial later, with 2 years included.</p>
            <button className="btn" disabled={!!busy} onClick={() => buy("living")}>{busy === "living" ? "…" : "Start"}</button>
          </div>
        )}
        {(m.plan.tier === "tribute" || m.plan.tier === "living") && (
          <div className="plan">
            <h3>{m.plan.tier === "living" ? "Renew Living Legacy" : "Keep it open"}</h3>
            <p className="price">{formatPrice(m.plan.tier === "living" ? "living" : "hosting", cur)}</p>
            <p className="small">Adds a year of hosting. Any admin can pay.</p>
            <button className="btn secondary" disabled={!!busy} onClick={() => buy(m.plan.tier === "living" ? "living" : "hosting")}>Renew</button>
          </div>
        )}
        {m.plan.tier !== "forever" && (
          <div className="plan">
            <h3>Forever</h3>
            <p className="price">{formatPrice("forever", cur)}</p>
            <p className="small">Everything, hosted for life. No renewals to remember.</p>
            <button className="btn secondary" disabled={!!busy} onClick={() => buy("forever")}>{busy === "forever" ? "…" : "Choose Forever"}</button>
          </div>
        )}
      </div>
      <p className="muted small">We never delete a page because a renewal was missed. It stays online and downloadable, and any admin can reopen it.</p>
    </section>
  );
}

function Settings({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const [f, setF] = useState({
    name: m.name, born: m.born ?? "", died: m.died ?? "", intro: m.intro ?? "", story: m.story ?? "",
    privacy: m.privacy, moderation: m.moderation, mode: m.mode,
    date: m.service?.date ?? "", time: m.service?.time ?? "", place: m.service?.place ?? "", livestreamUrl: m.service?.livestreamUrl ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [auditLog, setAudit] = useState<{ actorEmail: string; action: string; at: number; detail?: string }[]>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };
  return (
    <section className="stack">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        await api.patch(`/memorials/${m.id}`, { ...f, service: { date: f.date, time: f.time, place: f.place, livestreamUrl: f.livestreamUrl } });
        setSaved(true);
        onChange();
      }}>
        <h3>About {m.name}</h3>
        <label>Name<input value={f.name} onChange={set("name")} required /></label>
        <div className="row gap">
          <label className="grow">Born<input type="date" value={f.born} onChange={set("born")} /></label>
          <label className="grow">Passed away<input type="date" value={f.died} onChange={set("died")} /></label>
        </div>
        <label>Welcome message<textarea rows={3} value={f.intro} onChange={set("intro")} /></label>
        <label>Life story <span className="muted">(shown on the page)</span><textarea rows={8} value={f.story} onChange={set("story")} placeholder="Born in Bury in 1948, the youngest of five…" /></label>
        <CoverUpload m={m} onDone={onChange} />
        <h3>Service</h3>
        <div className="row gap wrap">
          <label className="grow">Date<input type="date" value={f.date} onChange={set("date")} /></label>
          <label className="grow">Time<input value={f.time} onChange={set("time")} /></label>
        </div>
        <label>Place<input value={f.place} onChange={set("place")} /></label>
        <label>Livestream link<input value={f.livestreamUrl} onChange={set("livestreamUrl")} placeholder="https://" /></label>
        <h3>Privacy and moderation</h3>
        <label>Who can see the page
          <select value={f.privacy} onChange={set("privacy")}>
            <option value="link">Anyone with the link</option>
            <option value="public">Public</option>
            <option value="private">Only admins and invited family</option>
          </select>
        </label>
        <label>Before memories appear
          <select value={f.moderation} onChange={set("moderation")}>
            <option value="approve_all">An admin approves everything first</option>
            <option value="auto">Show straight away unless screening flags it</option>
            <option value="trusted_only">Only trusted family post without review</option>
          </select>
        </label>
        <label>Page type
          <select value={f.mode} onChange={set("mode")}>
            <option value="living">Living Legacy</option>
            <option value="memorial">In memory</option>
          </select>
        </label>
        <div className="row gap"><button className="btn">Save</button>{saved && <span className="muted small">Saved</span>}</div>
      </form>
      <div className="card stack">
        <h3>Download everything</h3>
        <p className="muted small">A ZIP of every approved photo, video and recording, plus all the written memories.</p>
        <a className="btn secondary small" href={`/api/memorials/${m.id}/download`}>Download ZIP</a>
      </div>
      <div className="card stack">
        <h3>Activity</h3>
        {!auditLog ? (
          <button className="btn ghost small" onClick={() => api.get<{ audit: typeof auditLog }>(`/memorials/${m.id}/audit`).then((r) => setAudit(r.audit))}>Show who changed what</button>
        ) : (
          <ul className="audit">{auditLog.map((a, i) => <li key={i}><span className="muted">{new Date(a.at).toLocaleString()}</span> {a.actorEmail}: {a.action.replace(/_/g, " ")}{a.detail ? ` (${a.detail})` : ""}</li>)}</ul>
        )}
      </div>
      {m.role === "owner" && (
        <div className="card stack danger">
          <h3>Delete this page</h3>
          <p className="small">This permanently deletes the page and every memory on it. Download everything first.</p>
          <button className="btn ghost small" onClick={async () => {
            const typed = prompt(`Type "${m.name}" to delete the page forever.`);
            if (typed == null) return;
            try { await api.del(`/memorials/${m.id}`, { confirm: typed }); navigate("/dashboard"); } catch (e) { alert(e instanceof ApiError ? e.message : "Couldn't delete."); }
          }}>Delete page</button>
        </div>
      )}
    </section>
  );
}

function CoverUpload({ m, onDone }: { m: MemorialAdmin; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="row gap">
      {m.coverUrl && <img src={m.coverUrl} className="cover-thumb" alt="" />}
      <label className="btn secondary small">
        {busy ? "Uploading…" : m.coverUrl ? "Change main photo" : "Add a main photo"}
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const fd = new FormData();
          fd.append("file", file);
          await api.form(`/memorials/${m.id}/cover`, fd).catch((er) => alert(er.message));
          setBusy(false);
          onDone();
        }} />
      </label>
    </div>
  );
}
