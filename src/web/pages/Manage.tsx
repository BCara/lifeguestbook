import { useCallback, useEffect, useMemo, useState } from "react";
import { currencyForTimeZone, formatPrice, type Currency, type Product } from "../../shared/pricing";
import { isFrozen } from "../../shared/plans";
import { can, ROLE_LABELS, type Role } from "../../shared/roles";
import type { ContributionView, InviteView, MemberView, MemorialAdmin } from "../../shared/types";
import { api, ApiError } from "../api";
import { CopyField, Header, lifeDates, QrImage, RequireSignIn, timeAgo } from "../components";
import { Link, navigate, query } from "../router";
import { useSession } from "../session";
import { LifeStory } from "./LifeStory";
import { WritingHelp } from "./WritingHelp";
import { settingsChanges, settingsForm } from "../settings";

type Tab = "review" | "story" | "memories" | "writing" | "people" | "share" | "dayof" | "plan" | "settings";

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
  const [succession, setSuccession] = useState<{ ownerInactiveDays: number; recovery: { requestedBy: string; at: number } | null }>({ ownerInactiveDays: 0, recovery: null });
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>((query(location.search, "tab") as Tab) ?? "");
  const { me } = useSession();
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ memorial: MemorialAdmin; pendingTransfer: { toUid: string } | null; ownerInactiveDays: number; recovery: { requestedBy: string; at: number } | null }>(`/memorials/${id}`);
      setM(r.memorial);
      setPendingTransfer(r.pendingTransfer);
      setSuccession({ ownerInactiveDays: r.ownerInactiveDays, recovery: r.recovery });
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
  const current: Tab = tab || (m.mode === "living" ? "story" : "review");
  const welcome = query(location.search, "welcome");
  const tabs: [Tab, string, boolean][] = [
    ...(m.mode === "living" ? ([["story", "Life story", true]] as [Tab, string, boolean][]) : []),
    ["review", `Review${m.counts.pending ? ` (${m.counts.pending})` : ""}`, true],
    ...(m.mode === "memorial" ? ([["story", "Chapters", true]] as [Tab, string, boolean][]) : []),
    ["memories", "Memories", true],
    ["writing", "✦ Writing help", can(m.role, "manage_settings")],
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
            <p className="muted">{[lifeDates(m.born, m.died), m.mode === "living" ? "Living Legacy" : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <Link to={`/m/${m.slug}`} className="btn secondary">View page</Link>
        </div>
        {welcome && (
          <div className="notice">
            {m.mode === "living" ? (
              <>Your Living Legacy is ready. <button className="link" onClick={() => setTab("story")}>Choose a chapter and add your first story</button>.</>
            ) : current === "dayof" ? (
              <>Your guestbook is ready. <Link to={`/dashboard/${m.id}/print`}>Print your QR cards</Link> and scan one before the service.</>
            ) : m.privacy === "private" ? (
              <>Your private guestbook is ready. <button className="link" onClick={() => setTab("people")}>Invite family to join</button>.</>
            ) : (
              <>Your guestbook is ready. <button className="link" onClick={() => setTab("share")}>Share the contribution link</button>.</>
            )}
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
            <button key={key} ref={(el) => { if (current === key && el) el.parentElement?.scrollTo({ left: el.offsetLeft - 24 }); }} className={current === key ? "on" : ""} onClick={() => { setTab(key); history.replaceState(null, "", `?tab=${key}`); }}>
              {label}
            </button>
          ))}
        </nav>
        {current === "review" && <Review m={m} onChange={load} status="pending" />}
        {current === "story" && <LifeStory m={m} onChange={load} />}
        {current === "memories" && <Review m={m} onChange={load} status="all" />}
        {current === "writing" && <WritingHelp m={m} onChange={load} />}
        {current === "people" && <People m={m} onChange={load} succession={succession} />}
        {current === "share" && <Share m={m} />}
        {current === "dayof" && <DayOf m={m} onChange={load} />}
        {current === "plan" && <Plan m={m} onChange={load} />}
        {current === "settings" && <Settings m={m} onChange={load} />}
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

function People({ m, onChange, succession }: { m: MemorialAdmin; onChange: () => void; succession: { ownerInactiveDays: number; recovery: { requestedBy: string; at: number } | null } }) {
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
      {succession.recovery && (
        <div className="notice">
          {succession.recovery.requestedBy === me?.uid ? "You've asked to take over this page. " : m.role === "owner" ? "An admin has asked to take over this page because you hadn't signed in for a while. " : "An admin has asked to take over this page. "}
          It moves on {new Date(succession.recovery.at + 14 * 864e5).toLocaleDateString()} unless the owner cancels.{" "}
          {(m.role === "owner" || succession.recovery.requestedBy === me?.uid) && <button className="link" onClick={async () => { await api.post(`/memorials/${m.id}/recovery/cancel`); onChange(); }}>Cancel the request</button>}
        </div>
      )}
      {m.role === "admin" && !succession.recovery && succession.ownerInactiveDays >= 90 && (
        <div className="card stack">
          <h3>The owner hasn't signed in for {succession.ownerInactiveDays} days</h3>
          <p className="small">If they can't look after the page any more, you can ask to become the owner. We'll email them, and if they don't say no within 14 days, ownership moves to you. They stay on as an admin.</p>
          <button className="btn secondary small" onClick={async () => { await api.post(`/memorials/${m.id}/recovery`).catch((e) => alert(e.message)); onChange(); }}>Ask to become the owner</button>
        </div>
      )}
      {m.mode === "living" && data && <Succession m={m} members={data.members} onChange={onChange} />}
      {m.role === "owner" && <p className="muted small">If you ever step back, use "Make owner" to hand the page to another admin. Admins keep full access to photos, stories and moderation either way.</p>}
    </section>
  );
}

function Share({ m }: { m: MemorialAdmin }) {
  if (m.privacy === "private") {
    return <div className="notice">Only signed-in members can open this guestbook. Use People to invite family before sharing the link.</div>;
  }
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
  const [cancelling, setCancelling] = useState(false);
  const cancelRenewal = async () => {
    if (!confirm("Stop automatic renewal? Your page keeps its paid features until the hosting end date.")) return;
    setCancelling(true);
    try {
      await api.post("/payments/cancel-renewal", { memorialId: m.id });
      onChange();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Renewal could not be cancelled. Please try again.");
    } finally { setCancelling(false); }
  };
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
        {m.recurringBilling && (m.renewalCancelled
          ? <p>Automatic renewal is cancelled. Your paid hosting remains available until the date above.</p>
          : <><p>Your subscription renews automatically each year.</p><button className="btn secondary" disabled={cancelling || !!busy} onClick={cancelRenewal}>{cancelling ? "Cancelling…" : "Cancel automatic renewal"}</button></>)}
      </div>
      {!m.checkoutAvailable && m.plan.tier !== "forever" && <p className="notice">Paid upgrades are currently unavailable.</p>}
      {m.checkoutAvailable && <div className="plans">
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
        {(m.plan.tier === "tribute" || m.plan.tier === "living") && isFrozen(m.plan) && (!m.recurringBilling || m.renewalCancelled) && (
          <div className="plan">
            <h3>{m.plan.tier === "living" ? "Renew Living Legacy" : "Keep it open"}</h3>
            <p className="price">{formatPrice(m.plan.tier === "living" ? "living" : "hosting", cur)}</p>
            <p className="small">One year of hosting, renewing annually. Any admin can pay. You can cancel automatic renewal at any time.</p>
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
      </div>}
      <p className="muted small">We never delete a page because a renewal was missed. It stays online and downloadable, and any admin can reopen it.</p>
    </section>
  );
}

function Settings({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const [base, setBase] = useState(() => settingsForm(m));
  const [f, setF] = useState(base);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [auditLog, setAudit] = useState<{ actorEmail: string; action: string; at: number; detail?: string }[]>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setSaved(false); setSaveError(undefined); };
  return (
    <section className="stack">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        const body = settingsChanges(base, f);
        setSaving(true);
        setSaveError(undefined);
        try {
          if (Object.keys(body).length) {
            const r = await api.patch<{ memorial: MemorialAdmin }>(`/memorials/${m.id}`, body);
            const fresh = settingsForm(r.memorial);
            setBase(fresh);
            setF(fresh);
            onChange();
          }
          setSaved(true);
        } catch (err) {
          setSaveError(err instanceof ApiError ? err.message : "Couldn't save. Please check your connection and try again.");
        } finally {
          setSaving(false);
        }
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
        <div className="row gap"><button className="btn" disabled={saving}>{saving ? "Saving…" : "Save"}</button>{saved && <span className="muted small">Saved</span>}</div>
        {saveError && <p className="error" role="alert">{saveError}</p>}
      </form>
      <div className="card stack">
        <h3>Download everything</h3>
        <p className="muted small">A ZIP of every approved photo, video and recording, plus all the written memories.</p>
        <div className="row gap wrap">
          <a className="btn secondary small" href={`/api/memorials/${m.id}/download`}>Download ZIP</a>
          <Link to={`/dashboard/${m.id}/book`} className="btn secondary small">Printable memory book</Link>
        </div>
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

function Succession({ m, members, onChange }: { m: MemorialAdmin; members: MemberView[]; onChange: () => void }) {
  const { me } = useSession();
  const [converting, setConverting] = useState(false);
  const [died, setDied] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [result, setResult] = useState<string>();
  const admins = members.filter((x) => x.role === "admin");
  const contact = members.find((x) => x.uid === m.legacyContactUid);
  const mayConvert = m.role === "owner" || (m.role === "admin" && m.legacyContactUid === me?.uid);
  const first = m.name.split(" ")[0];
  return (
    <div className="card stack">
      <h3>When the time comes</h3>
      <p className="small">Choose a <strong>legacy contact</strong>: the person who will turn this into {first}'s memorial page. Nothing recorded is lost, letters sealed "until I'm gone" open for the family, and friends can start sharing their memories.</p>
      {m.role === "owner" ? (
        <label>Legacy contact
          <select value={m.legacyContactUid ?? ""} onChange={async (e) => { await api.post(`/memorials/${m.id}/legacy-contact`, { uid: e.target.value || null }); onChange(); }}>
            <option value="">Not chosen yet</option>
            {admins.map((a) => <option key={a.uid} value={a.uid}>{a.email}</option>)}
          </select>
          {admins.length === 0 && <span className="muted small">Invite an admin first.</span>}
        </label>
      ) : <p className="small">Legacy contact: {contact ? contact.email : "not chosen yet"}</p>}
      {mayConvert && !converting && <button className="btn ghost small" onClick={() => setConverting(true)}>Turn this into a memorial page…</button>}
      {converting && (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const r = await api.post<{ lettersOpened: number }>(`/memorials/${m.id}/convert`, { died, service: { date, place } });
          setResult(`${m.name}'s page is now a memorial.${r.lettersOpened ? ` ${r.lettersOpened} sealed ${r.lettersOpened === 1 ? "letter has" : "letters have"} opened for the family.` : ""}`);
          onChange();
        }}>
          <p className="small">We're so sorry. This changes the page to "In loving memory", opens sealed letters for the family and lets everyone share memories.</p>
          <label>Date {first} passed away<input type="date" required value={died} onChange={(e) => setDied(e.target.value)} /></label>
          <div className="row gap wrap">
            <label className="grow">Service date (optional)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="grow">Place (optional)<input value={place} onChange={(e) => setPlace(e.target.value)} /></label>
          </div>
          <div className="row gap"><button className="btn">Make it a memorial</button><button type="button" className="link" onClick={() => setConverting(false)}>Cancel</button></div>
        </form>
      )}
      {result && <p className="notice">{result}</p>}
    </div>
  );
}
