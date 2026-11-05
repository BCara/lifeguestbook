import { useEffect, useState } from "react";
import { RELATIONS, type MemorialPublic } from "../../shared/types";
import { MAX_UPLOAD_BYTES } from "../../shared/plans";
import { api, ApiError, uploadForm } from "../api";
import { lifeDates } from "../components";
import { Link, query } from "../router";

const NAME_KEY = "lgb-name";
const remember = (k: string, v?: string) => {
  try {
    if (v === undefined) return localStorage.getItem(k) ?? "";
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
  return "";
};

export function AddMemory({ slug }: { slug: string }) {
  const [m, setM] = useState<MemorialPublic>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState(() => remember(NAME_KEY) ?? "");
  const [relation, setRelation] = useState("");
  const [era, setEra] = useState("");
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string>();
  const [done, setDone] = useState<{ count: number; pending: boolean }>();
  const source = query(location.search, "src") === "qr" ? "event" : "online";
  useEffect(() => {
    api.get<{ memorial: MemorialPublic }>(`/m/${slug}`).then((r) => setM(r.memorial)).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load."));
  }, [slug]);
  if (error && !m) return <main className="narrow"><p>{error}</p></main>;
  if (!m) return <div className="page-center muted">Loading…</div>;
  if (!m.allowance.acceptingContributions) return <main className="narrow"><h1>{m.name}</h1><p>This page isn't taking new memories right now.</p><Link to={`/m/${slug}`}>See the page</Link></main>;
  const accept = ["image/*", ...(m.allowance.video ? ["video/*"] : []), ...(m.allowance.voice ? ["audio/*"] : [])].join(",");

  if (done)
    return (
      <main className="narrow guest">
        <h1>Thank you{name ? `, ${name.split(" ")[0]}` : ""}.</h1>
        <p className="lead">{done.pending ? "The family will see your memory shortly. It will appear on the page once they've approved it." : "Your memory is on the page now."}</p>
        <div className="row gap wrap">
          <button className="btn" onClick={() => { setDone(undefined); setFiles([]); setText(""); }}>Share another</button>
          <Link to={`/m/${slug}`} className="btn secondary">See {m.name.split(" ")[0]}'s page</Link>
        </div>
      </main>
    );

  return (
    <main className="narrow guest">
      <header className="guest-head">
        {m.coverUrl && <img src={m.coverUrl} alt="" className="guest-cover" />}
        <div>
          <p className="eyebrow">{m.mode === "memorial" ? "Share a memory of" : "Share a memory with"}</p>
          <h1>{m.name}</h1>
          <p className="muted">{lifeDates(m.born, m.died)}</p>
        </div>
      </header>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        remember(NAME_KEY, name);
        const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
        if (tooBig) return setError(`"${tooBig.name}" is over 30 MB. Try a shorter clip.`);
        const batches = files.length ? files : [null];
        let pending = false;
        try {
          for (let i = 0; i < batches.length; i++) {
            const fd = new FormData();
            fd.append("name", name);
            fd.append("relation", relation);
            fd.append("era", era);
            fd.append("email", email);
            fd.append("source", source);
            if (i === 0 || !batches[i]) fd.append("text", text); // the words go with the first photo
            if (batches[i]) fd.append("file", batches[i]!);
            const r = await uploadForm<{ status: string }>(`/m/${slug}/contributions`, fd, (p) =>
              setProgress(batches.length > 1 ? `Sending ${i + 1} of ${batches.length}… ${Math.round(p * 100)}%` : `Sending… ${Math.round(p * 100)}%`));
            if (r.status !== "approved") pending = true;
          }
          setDone({ count: batches.length, pending });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        } finally {
          setProgress(undefined);
        }
      }}>
        <label className="file-drop">
          <input type="file" multiple accept={accept} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          {files.length ? <span>{files.length} {files.length === 1 ? "file" : "files"} chosen</span> : <span><strong>Add photos</strong>{m.allowance.video ? ", videos or voice notes" : ""}</span>}
        </label>
        {files.length > 0 && (
          <div className="previews">
            {files.slice(0, 12).map((f, i) => f.type.startsWith("image/") ? <img key={i} src={URL.createObjectURL(f)} alt="" /> : <span key={i} className="file-chip">{f.name}</span>)}
          </div>
        )}
        <label>
          A memory, a story, or a few words
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="The time at uni when…" />
        </label>
        <label>
          Your name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <div className="row gap wrap">
          <label className="grow">
            How you knew {m.name.split(" ")[0]}
            <select value={relation} onChange={(e) => setRelation(e.target.value)}>
              <option value="">Choose…</option>
              {RELATIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="grow">
            When was this? <span className="muted">(optional)</span>
            <input value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. 1970s or 1985" />
          </label>
        </div>
        <label>
          Your email <span className="muted">(optional: we'll tell you when it's on the page)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn big" disabled={!!progress || (!files.length && !text.trim())}>{progress ?? "Share"}</button>
        <p className="muted small center">No app or account needed. The family reviews memories before they appear.</p>
      </form>
    </main>
  );
}
