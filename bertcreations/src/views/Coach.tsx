import { useEffect, useRef, useState } from "react";
import { COACH_MODES, type ChatMsg, type CoachMode, type Idea } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { Avatar, Markdown, Thinking } from "../ui";

const STARTERS: Record<CoachMode, string[]> = {
  coach: ["What should we do this week?", "Which of our ideas suits us best?", "Help us price this"],
  skeptic: ["Tear this apart", "What's the riskiest assumption?", "Why would this fail?"],
  customer: ["Would you buy this?", "What would you pay?", "Where would you hear about us?"],
  investor: ["Here's our pitch…", "What would make you invest?", "How big could this get?"],
};

export function Coach({ idea }: { idea?: Idea }) {
  const { ws, mutate, toast, memberById, refresh, meId } = useStudio();
  const [mode, setMode] = useState<CoachMode>("coach");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<ChatMsg | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const chat = (idea ? idea.chat : ws.chat) ?? [];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, optimistic, busy]);

  const send = async (t = text) => {
    if (!t.trim() || busy) return;
    setText("");
    setBusy(true);
    setOptimistic({ role: "user", who: meId, text: t, mode, at: new Date().toISOString() });
    try {
      await api("/ai/coach", { body: { ideaId: idea?.id, mode, text: t } });
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      setText(t);
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  };

  const clear = () => {
    if (!confirm("Clear this conversation for everyone?")) return;
    mutate(
      (w) => {
        if (idea) {
          const i = w.ideas.find((x) => x.id === idea.id);
          if (i) i.chat = [];
        } else w.chat = [];
      },
      () => api("/ai/chat/clear", { body: { ideaId: idea?.id } }),
    );
  };

  const shown = optimistic ? [...chat, { ...optimistic }] : chat;

  return (
    <div className="coach">
      <div className="modes">
        {(Object.keys(COACH_MODES) as CoachMode[]).map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={COACH_MODES[m].hint}>
            {COACH_MODES[m].emoji} {COACH_MODES[m].label}
          </button>
        ))}
      </div>
      <div className="messages" ref={scroller}>
        {!shown.length && (
          <div className="coach-empty">
            <p>
              <strong>{COACH_MODES[mode].emoji} {COACH_MODES[mode].label}</strong>: {COACH_MODES[mode].hint.toLowerCase()}.
            </p>
            <p className="muted small">Everyone in the studio sees this conversation, so you can pick it up together later.</p>
          </div>
        )}
        {shown.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "user" ? <Avatar m={memberById(m.who)} size={26} /> : <span className="bot">{COACH_MODES[m.mode ?? "coach"].emoji}</span>}
            <div className="bubble">{m.role === "assistant" ? <Markdown text={m.text} /> : m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <span className="bot">{COACH_MODES[mode].emoji}</span>
            <div className="bubble">
              <Thinking />
            </div>
          </div>
        )}
      </div>
      <div className="chips">
        {STARTERS[mode].map((s) => (
          <button key={s} className="chip" onClick={() => (s.endsWith("…") ? setText(s.replace("…", " ")) : send(s))}>
            {s}
          </button>
        ))}
      </div>
      <div className="composer">
        <textarea
          value={text}
          rows={2}
          placeholder={`Message the ${COACH_MODES[mode].label.toLowerCase()}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send()}>
          Send
        </button>
      </div>
      {chat.length > 0 && (
        <button className="link-btn" onClick={clear}>
          Clear conversation
        </button>
      )}
    </div>
  );
}
