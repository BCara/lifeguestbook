import { useState } from "react";
import { api, ApiError } from "../api";
import { Header, RequireSignIn } from "../components";
import { navigate, query } from "../router";

export function Create() {
  return (
    <RequireSignIn>
      <CreateInner />
    </RequireSignIn>
  );
}

function CreateInner() {
  const purpose = query(location.search, "purpose");
  const [mode, setMode] = useState<"memorial" | "living">(query(location.search, "mode") === "living" ? "living" : "memorial");
  const [f, setF] = useState({ name: "", born: "", died: "", intro: "", date: "", time: "", place: "", coAdmin1: "", coAdmin2: "", moderation: "approve_all", privacy: "link" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Header />
      <main className="narrow">
        <h1>{mode === "living" ? "Start a Living Legacy" : "Create a memorial page"}</h1>
        <div className="segmented">
          <button className={mode === "memorial" ? "on" : ""} onClick={() => setMode("memorial")}>In memory</button>
          <button className={mode === "living" ? "on" : ""} onClick={() => setMode("living")}>Living Legacy</button>
        </div>
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              const r = await api.post<{ id: string }>("/memorials", {
                requestId,
                mode,
                name: f.name,
                born: f.born,
                died: f.died,
                intro: f.intro,
                privacy: f.privacy,
                moderation: f.moderation,
                service: { date: f.date, time: f.time, place: f.place },
                coAdmins: [f.coAdmin1, f.coAdmin2].filter(Boolean),
              });
              const tab = mode === "living" ? "story" : purpose === "day-of" ? "dayof" : purpose === "afar" ? "share" : "review";
              navigate(`/dashboard/${r.id}?welcome=1&tab=${tab}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Something went wrong.");
              setBusy(false);
            }
          }}
        >
          <label>
            Their name
            <input required value={f.name} onChange={set("name")} placeholder="e.g. Margaret Ellen Hughes" />
          </label>
          <div className="row gap wrap">
            <label className="grow">
              Born
              <input type="date" value={f.born} onChange={set("born")} />
            </label>
            {mode === "memorial" && (
              <label className="grow">
                Passed away
                <input type="date" value={f.died} onChange={set("died")} />
              </label>
            )}
          </div>
          <label>
            A few words to welcome people <span className="muted">(optional)</span>
            <textarea rows={3} value={f.intro} onChange={set("intro")} placeholder="Mum loved her garden, terrible puns and Sunday roasts. Please share your photos and stories of her." />
          </label>
          {mode === "memorial" && (
            <fieldset>
              <legend>The service <span className="muted">(optional, you can add it later)</span></legend>
              <div className="row gap wrap">
                <label className="grow">
                  Date
                  <input type="date" value={f.date} onChange={set("date")} />
                </label>
                <label className="grow">
                  Time
                  <input value={f.time} onChange={set("time")} placeholder="11:00am" />
                </label>
              </div>
              <label>
                Place
                <input value={f.place} onChange={set("place")} placeholder="St Mary's Church, Bury" />
              </label>
            </fieldset>
          )}
          <fieldset>
            <legend>Who else should look after this page?</legend>
            <p className="muted small">Co-admins have full access, so the page is never locked to one person. We'll email them an invitation.</p>
            <input type="email" value={f.coAdmin1} onChange={set("coAdmin1")} placeholder="sister@example.com" />
            <input type="email" value={f.coAdmin2} onChange={set("coAdmin2")} placeholder="another family member (optional)" />
          </fieldset>
          <fieldset>
            <legend>Before memories appear</legend>
            <select value={f.moderation} onChange={set("moderation")}>
              <option value="approve_all">An admin approves everything first (recommended)</option>
              <option value="auto">Show straight away unless our screening flags it</option>
            </select>
          </fieldset>
          <fieldset>
            <legend>Who can see the page</legend>
            <select value={f.privacy} onChange={set("privacy")}>
              <option value="link">Anyone with the link (recommended)</option>
              <option value="public">Public and findable on search engines</option>
              <option value="private">Only invited admins and family</option>
            </select>
          </fieldset>
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create the page"}</button>
        </form>
      </main>
    </>
  );
}
