import { useState } from "react";
import { STAGES, STAGE_META, averageRating, type Stage } from "../../shared/types";
import { useStudio } from "../studio";
import { Avatar, ScoreRing } from "../ui";

export function Pipeline({ onOpen }: { onOpen: (id: string) => void }) {
  const { ws, patchIdea, memberById } = useStudio();
  const [over, setOver] = useState<Stage | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="pipeline">
      {STAGES.map((stage) => {
        const ideas = ws.ideas
          .filter((i) => i.stage === stage)
          .sort((a, b) => (b.future?.score ?? -1) - (a.future?.score ?? -1));
        const meta = STAGE_META[stage];
        return (
          <section
            key={stage}
            className={`column ${over === stage ? "over" : ""}`}
            style={{ ["--stage" as string]: meta.color }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              setOver(null);
              if (id && ws.ideas.find((i) => i.id === id)?.stage !== stage) patchIdea(id, { stage });
            }}
          >
            <header>
              <h3>
                <i />
                {meta.label}
                <span className="count">{ideas.length}</span>
              </h3>
              <p>{meta.hint}</p>
            </header>
            <div className="col-cards">
              {ideas.map((idea) => {
                const avg = averageRating(idea);
                return (
                  <article
                    key={idea.id}
                    className="pcard"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", idea.id);
                      setDragId(idea.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(idea.id)}
                  >
                    <div className="pcard-top">
                      <span className="card-emoji">{idea.emoji}</span>
                      <h4>{idea.title}</h4>
                      <ScoreRing score={idea.future?.score} size={30} />
                    </div>
                    <div className="pcard-meta">
                      {avg && (
                        <span>
                          🔥{avg.excitement.toFixed(1)} 🧱{avg.feasibility.toFixed(1)}
                        </span>
                      )}
                      {idea.tasks.length > 0 && (
                        <span>
                          ✓ {idea.tasks.filter((t) => t.done).length}/{idea.tasks.length}
                        </span>
                      )}
                      <span className="hearts">
                        {idea.hearts.map((h) => (
                          <Avatar key={h} m={memberById(h)} size={18} />
                        ))}
                      </span>
                    </div>
                    <select
                      className="stage-select"
                      value={idea.stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => patchIdea(idea.id, { stage: e.target.value as Stage })}
                      aria-label="Move to stage"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_META[s].label}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
              {!ideas.length && <div className="col-empty">Drag ideas here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
