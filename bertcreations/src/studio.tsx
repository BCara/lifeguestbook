import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Idea, Member, Workspace } from "../shared/types";
import { api, local, setMemberHeader } from "./api";

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

interface StudioCtx {
  ws: Workspace;
  me: Member | undefined;
  meId: string;
  setMe: (id: string) => void;
  ai: { live: boolean; model: string | null };
  /** Apply a change locally straight away, then send it; resync from the server either way. */
  mutate: (local: (ws: Workspace) => void, remote: () => Promise<unknown>) => Promise<void>;
  patchIdea: (id: string, patch: Partial<Idea>) => Promise<void>;
  refresh: () => Promise<void>;
  toast: (text: string, kind?: Toast["kind"]) => void;
  memberById: (id: string | undefined) => Member | undefined;
}

const Ctx = createContext<StudioCtx | null>(null);
export const useStudio = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudio outside provider");
  return c;
};

export function StudioProvider({ initial, ai, children }: { initial: Workspace; ai: StudioCtx["ai"]; children: ReactNode }) {
  const [ws, setWs] = useState(initial);
  const [meId, setMeId] = useState(() => local.get("bc.me"));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const rev = useRef(initial.rev);
  const pending = useRef(0);

  setMemberHeader(meId);

  const refresh = useCallback(async () => {
    const r = await api<{ changed: boolean; workspace?: Workspace }>(`/state?rev=${rev.current}`);
    // Don't let a poll overwrite an optimistic change that's still in flight.
    if (r.changed && r.workspace && pending.current === 0) {
      rev.current = r.workspace.rev;
      setWs(r.workspace);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await refresh().catch(() => undefined);
      if (alive) timer = window.setTimeout(tick, 3500);
    };
    let timer = window.setTimeout(tick, 3500);
    const onFocus = () => refresh().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const mutate = useCallback<StudioCtx["mutate"]>(
    async (apply, remote) => {
      setWs((cur) => {
        const next = structuredClone(cur);
        apply(next);
        return next;
      });
      pending.current++;
      try {
        await remote();
      } catch (e) {
        toast((e as Error).message, "error");
        rev.current = -1; // force a full resync to undo the optimistic change
      } finally {
        pending.current--;
        await refresh().catch(() => undefined);
      }
    },
    [refresh, toast],
  );

  const patchIdea = useCallback<StudioCtx["patchIdea"]>(
    (id, patch) =>
      mutate(
        (w) => {
          const i = w.ideas.find((x) => x.id === id);
          if (i) Object.assign(i, patch);
        },
        () => api(`/ideas/${id}`, { method: "PATCH", body: patch }),
      ),
    [mutate],
  );

  const setMe = useCallback((id: string) => {
    local.set("bc.me", id);
    setMeId(id);
    setMemberHeader(id);
  }, []);

  const value = useMemo<StudioCtx>(
    () => ({
      ws,
      me: ws.members.find((m) => m.id === meId),
      meId,
      setMe,
      ai,
      mutate,
      patchIdea,
      refresh,
      toast,
      memberById: (id) => ws.members.find((m) => m.id === id),
    }),
    [ws, meId, setMe, ai, mutate, patchIdea, refresh, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
