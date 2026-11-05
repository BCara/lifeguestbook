import { MEMBER_COLORS, type Member, type StudioProfile } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { Avatar, Editable } from "../ui";

export function Us() {
  const { ws, mutate, ai, meId, setMe } = useStudio();

  const saveMembers = (members: Member[]) =>
    mutate(
      (w) => void (w.members = members),
      () => api("/members", { method: "PUT", body: members }),
    );
  const saveStudio = (patch: Partial<StudioProfile>) => {
    const studio = { ...ws.studio, ...patch };
    return mutate(
      (w) => void (w.studio = studio),
      () => api("/studio", { method: "PUT", body: studio }),
    );
  };
  const setMember = (id: string, patch: Partial<Member>) => saveMembers(ws.members.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div className="us">
      <div className="us-head">
        <h1>Us</h1>
        <p className="muted">The more the AI knows about you, the better its ideas fit. Everything here feeds into every AI answer.</p>
      </div>

      <div className="members">
        {ws.members.map((m) => (
          <section key={m.id} className="panel member" style={{ ["--c" as string]: m.color }}>
            <div className="member-top">
              <Avatar m={m} size={52} />
              <div className="member-name">
                <Editable value={m.name} onSave={(name) => name && setMember(m.id, { name })} maxLength={40} />
                <div className="swatches">
                  {MEMBER_COLORS.map((c) => (
                    <button key={c} className={`swatch ${m.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setMember(m.id, { color: c })} aria-label={`Colour ${c}`} />
                  ))}
                </div>
              </div>
              <Editable className="emoji-input" value={m.emoji} onSave={(emoji) => emoji && setMember(m.id, { emoji })} maxLength={4} />
            </div>
            <label className="field">
              <span>Skills and experience</span>
              <Editable multiline value={m.skills} placeholder="Jobs you've done, things you're great at, qualifications…" onSave={(skills) => setMember(m.id, { skills })} />
            </label>
            <label className="field">
              <span>Interests and passions</span>
              <Editable multiline value={m.interests} placeholder="What do you love, what could you talk about for hours?" onSave={(interests) => setMember(m.id, { interests })} />
            </label>
            <div className="row">
              {m.id === meId ? (
                <span className="muted small">This is you on this device.</span>
              ) : (
                <button className="link-btn" onClick={() => setMe(m.id)}>
                  Switch to {m.name}
                </button>
              )}
              {ws.members.length > 1 && (
                <button
                  className="link-btn danger"
                  onClick={() => confirm(`Remove ${m.name} from the studio?`) && saveMembers(ws.members.filter((x) => x.id !== m.id))}
                >
                  Remove
                </button>
              )}
            </div>
          </section>
        ))}
        {ws.members.length < 6 && (
          <button
            className="panel add-member"
            onClick={() =>
              saveMembers([
                ...ws.members,
                { id: `m-${Math.random().toString(36).slice(2, 8)}`, name: "New partner", emoji: "🐼", color: MEMBER_COLORS[ws.members.length % MEMBER_COLORS.length], skills: "", interests: "" },
              ])
            }
          >
            + Add a partner
          </button>
        )}
      </div>

      <section className="panel studio-profile">
        <h3>🏠 The studio</h3>
        <div className="grid-2">
          <label className="field">
            <span>Studio name</span>
            <Editable value={ws.studio.name} onSave={(name) => name && saveStudio({ name })} maxLength={60} />
          </label>
          <label className="field">
            <span>Where we're based</span>
            <Editable value={ws.studio.location} placeholder="e.g. Bristol, UK" onSave={(location) => saveStudio({ location })} />
          </label>
          <label className="field">
            <span>Starting budget</span>
            <Editable value={ws.studio.budget} placeholder="e.g. £5,000" onSave={(budget) => saveStudio({ budget })} />
          </label>
          <label className="field">
            <span>Hours per week between us</span>
            <Editable value={ws.studio.hoursPerWeek} placeholder="e.g. 15" onSave={(hoursPerWeek) => saveStudio({ hoursPerWeek })} />
          </label>
        </div>
        <label className="field">
          <span>Constraints and must-haves</span>
          <Editable
            multiline
            value={ws.studio.constraints}
            placeholder="Keep our day jobs for now? Must work around kids? No big loans? Want to work outdoors?"
            onSave={(constraints) => saveStudio({ constraints })}
          />
        </label>
      </section>

      <section className="panel">
        <h3>🛡️ Built to last</h3>
        <ul className="safe-list">
          <li>
            <strong>AI:</strong> {ai.live ? `connected (${ai.model}).` : "demo mode. Add an ANTHROPIC_API_KEY on the server to switch on real AI."} The model is a
            setting, so you can upgrade to newer models without changing the app.
          </li>
          <li>
            <strong>Your data is yours:</strong> everything lives in your own storage, and you can download it all as one file at any time.
          </li>
          <li>
            <strong>Private:</strong> passcode-locked, hidden from search engines, and AI calls happen on the server so no keys ever reach the browser.
          </li>
        </ul>
        <div className="row">
          <a className="btn ghost small" href="/api/export" download>
            ⬇ Download everything (JSON)
          </a>
          <button
            className="btn ghost small"
            onClick={async () => {
              await api("/logout", { body: {} });
              location.reload();
            }}
          >
            🔒 Lock the studio on this device
          </button>
        </div>
      </section>
    </div>
  );
}
