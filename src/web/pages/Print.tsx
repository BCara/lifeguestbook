import { useEffect, useState } from "react";
import type { MemorialAdmin } from "../../shared/types";
import { api } from "../api";
import { lifeDates, QrImage, RequireSignIn } from "../components";
import { Link } from "../router";

export function Print({ id }: { id: string }) {
  return <RequireSignIn><PrintInner id={id} /></RequireSignIn>;
}

function PrintInner({ id }: { id: string }) {
  const [m, setM] = useState<MemorialAdmin>();
  const [layout, setLayout] = useState<"cards" | "poster">("cards");
  useEffect(() => void api.get<{ memorial: MemorialAdmin }>(`/memorials/${id}`).then((r) => setM(r.memorial)), [id]);
  if (!m) return <div className="page-center muted">Loading…</div>;
  const url = `${location.origin}/m/${m.slug}/add?src=qr`;
  const Card = ({ big }: { big?: boolean }) => (
    <div className={big ? "print-poster" : "print-card"}>
      <p className="eyebrow">{m.mode === "memorial" ? "Celebrating the life of" : "Sharing memories with"}</p>
      <h2>{m.name}</h2>
      <p className="muted">{lifeDates(m.born, m.died)}</p>
      <QrImage value={url} size={big ? 340 : 150} />
      <p>Scan to share a photo or memory</p>
      <p className="muted small">No app needed</p>
    </div>
  );
  return (
    <div className="print-page">
      <div className="no-print row gap wrap toolbar">
        <Link to={`/dashboard/${id}?tab=share`}>← Back</Link>
        <div className="segmented">
          <button className={layout === "cards" ? "on" : ""} onClick={() => setLayout("cards")}>Table cards (4 per A4)</button>
          <button className={layout === "poster" ? "on" : ""} onClick={() => setLayout("poster")}>A4 poster</button>
        </div>
        <button className="btn" onClick={() => window.print()}>Print</button>
      </div>
      <div className="print-scroll">{layout === "cards" ? <div className="print-grid">{[0, 1, 2, 3].map((i) => <Card key={i} />)}</div> : <Card big />}</div>
    </div>
  );
}
