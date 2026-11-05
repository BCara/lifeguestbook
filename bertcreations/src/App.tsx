import { useCallback, useEffect, useState } from "react";
import { MEMBER_COLORS, type Member, type Workspace } from "../shared/types";
import { api, local } from "./api";
import { StudioProvider, useStudio } from "./studio";
import { Avatar } from "./ui";
import { Board } from "./views/Board";
import { Coach } from "./views/Coach";
import { FutureMap } from "./views/FutureMap";
import { IdeaDrawer } from "./views/IdeaDrawer";
import { Lock } from "./views/Lock";
import { Pipeline } from "./views/Pipeline";
import { Us } from "./views/Us";
import { VisionView } from "./views/Vision";

type Boot = { state: "loading" } | { state: "locked" } | { state: "ready"; ws: Workspace; ai: { live: boolean; model: string | null } };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });

  const load = useCallback(async () => {
    try {
      const s = await api<{ ai: { live: boolean; model: string | null } }>("/session");
      const st = await api<{ workspace: Workspace }>("/state");
      setBoot({ state: "ready", ws: st.workspace, ai: s.ai });
    } catch {
      setBoot({ state: "locked" });
    }
  }, []);

  useEffect(() => {
    load();
    const onLocked = () => setBoot({ state: "locked" });
    window.addEventListener("studio:locked", onLocked);
    return () => window.removeEventListener("studio:locked", onLocked);
  }, [load]);

  if (boot.state === "loading") return <div className="splash"><div className="logo-orb big" /></div>;
  if (boot.state === "locked") return <Lock onUnlock={load} />;
  return (
    <StudioProvider initial={boot.ws} ai={boot.ai}>
      <Gate />
    </StudioProvider>
  );
}

function Gate() {
  const { ws, me } = useStudio();
  if (!ws.members.length) return <Setup />;
  if (!me) return <WhoAreYou />;
  return <Shell />;
}

const TABS = [
  { id: "board", label: "Idea Board", icon: "✦" },
  { id: "pipeline", label: "Pipeline", icon: "▤" },
  { id: "map", label: "Future Map", icon: "◎" },
  { id: "vision", label: "Vision", icon: "★" },
  { id: "us", label: "Us", icon: "☺" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Shell() {
  const { ws, me, ai, setMe } = useStudio();
  const [tab, setTabState] = useState<Tab>(() => (TABS.some((t) => t.id === local.get("bc.tab")) ? (local.get("bc.tab") as Tab) : "board"));
  const [openIdea, setOpenIdea] = useState<string | null>(null);
  const [coach, setCoach] = useState(false);
  const setTab = (t: Tab) => {
    setTabState(t);
    local.set("bc.tab", t);
  };
  const idea = ws.ideas.find((i) => i.id === openIdea);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo-orb" />
          <div>
            <strong>{ws.studio.name}</strong>
            <span>Studio</span>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="top-right">
          <span className={`ai-chip ${ai.live ? "live" : "demo"}`} title={ai.live ? `Connected to ${ai.model}` : "Add ANTHROPIC_API_KEY on the server to switch on real AI"}>
            {ai.live ? "AI live" : "AI demo"}
          </span>
          <button className="btn ghost small" onClick={() => setCoach((v) => !v)}>
            🧭 <span className="hide-sm">Co-founder</span>
          </button>
          <button className="me" onClick={() => setMe("")} title={`You're ${me?.name}. Click to switch.`}>
            <Avatar m={me} />
          </button>
        </div>
      </header>

      <main className={`main tab-${tab}`}>
        {tab === "board" && <Board onOpen={setOpenIdea} />}
        {tab === "pipeline" && <Pipeline onOpen={setOpenIdea} />}
        {tab === "map" && <FutureMap onOpen={setOpenIdea} />}
        {tab === "vision" && <VisionView onOpen={setOpenIdea} />}
        {tab === "us" && <Us />}
      </main>

      {idea && <IdeaDrawer idea={idea} onClose={() => setOpenIdea(null)} />}
      {coach && !idea && (
        <aside className="drawer coach-drawer">
          <header className="drawer-head">
            <h2>🧭 AI co-founder</h2>
            <button className="icon-btn" onClick={() => setCoach(false)} aria-label="Close">
              ✕
            </button>
          </header>
          <Coach />
        </aside>
      )}
    </div>
  );
}

function Setup() {
  const { mutate, setMe, ws } = useStudio();
  const [people, setPeople] = useState<Member[]>([
    { id: "m1", name: "Bert", emoji: "🦊", color: MEMBER_COLORS[0], skills: "", interests: "" },
    { id: "m2", name: "", emoji: "🐻", color: MEMBER_COLORS[1], skills: "", interests: "" },
  ]);
  const [studioName, setStudioName] = useState(ws.studio.name);
  const valid = people.filter((p) => p.name.trim());
  const save = async () => {
    const members = valid.map((p, i) => ({ ...p, id: `m${i + 1}-${Math.random().toString(36).slice(2, 6)}`, name: p.name.trim() }));
    await mutate(
      (w) => {
        w.members = members;
        w.studio.name = studioName.trim() || "Bert Creations";
      },
      async () => {
        await api("/members", { method: "PUT", body: members });
        await api("/studio", { method: "PUT", body: { ...ws.studio, name: studioName.trim() || "Bert Creations" } });
      },
    );
    setMe(members[0].id);
  };
  return (
    <div className="center-screen">
      <div className="glass setup">
        <div className="logo-orb big" />
        <h1>Welcome to the studio</h1>
        <p className="muted">First, who's building this together? You can add skills and interests later, which helps the AI tailor its ideas.</p>
        <label className="field">
          <span>Studio name</span>
          <input value={studioName} onChange={(e) => setStudioName(e.target.value)} />
        </label>
        {people.map((p, i) => (
          <div className="person-row" key={i}>
            <input className="emoji-input" value={p.emoji} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} maxLength={4} aria-label="Emoji" />
            <input placeholder="Name" value={p.name} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <div className="swatches">
              {MEMBER_COLORS.map((c) => (
                <button key={c} className={`swatch ${p.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setPeople(people.map((x, j) => (j === i ? { ...x, color: c } : x)))} aria-label={`Colour ${c}`} />
              ))}
            </div>
          </div>
        ))}
        {people.length < 6 && (
          <button className="btn ghost small" onClick={() => setPeople([...people, { id: "", name: "", emoji: "🐼", color: MEMBER_COLORS[people.length % MEMBER_COLORS.length], skills: "", interests: "" }])}>
            + Add someone
          </button>
        )}
        <button className="btn primary wide" disabled={!valid.length} onClick={save}>
          Open the studio →
        </button>
      </div>
    </div>
  );
}

function WhoAreYou() {
  const { ws, setMe } = useStudio();
  return (
    <div className="center-screen">
      <div className="glass setup">
        <div className="logo-orb big" />
        <h1>Who's here?</h1>
        <div className="who-grid">
          {ws.members.map((m) => (
            <button key={m.id} className="who" onClick={() => setMe(m.id)}>
              <Avatar m={m} size={64} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
        <button
          className="btn ghost small"
          onClick={async () => {
            await api("/logout", { method: "POST", body: {} });
            location.reload();
          }}
        >
          Lock the studio
        </button>
      </div>
    </div>
  );
}
