import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  defaultWorkspace,
  type ActivityItem,
  type ChatMsg,
  type Idea,
  type Member,
  type StudioProfile,
  type Vision,
  type Workspace,
} from "../shared/types";

export interface Docs {
  studio: StudioProfile;
  members: Member[];
  vision: Vision;
  activity: ActivityItem[];
  chat: ChatMsg[];
}
export type DocKey = keyof Docs;

/**
 * Storage for the one shared workspace. Every write bumps `rev`, so browsers can poll
 * cheaply ("has anything changed since rev N?") and only download the workspace when it has.
 * Writes are read-modify-write on a single idea or doc, so two people editing different
 * ideas at the same moment never overwrite each other.
 */
export interface Store {
  rev(): Promise<number>;
  load(): Promise<Workspace>;
  updateIdea(id: string, fn: (cur: Idea | undefined) => Idea | null): Promise<Idea | null>;
  updateDoc<K extends DocKey>(key: K, fn: (cur: Docs[K]) => Docs[K]): Promise<Docs[K]>;
}

const ACTIVITY_LIMIT = 60;
export const trimActivity = (a: ActivityItem[]) => a.slice(-ACTIVITY_LIMIT);

function withDefaults(raw: Partial<Workspace>): Workspace {
  const d = defaultWorkspace();
  return {
    rev: raw.rev ?? 0,
    studio: { ...d.studio, ...(raw.studio ?? {}) },
    members: raw.members ?? d.members,
    vision: { ...d.vision, ...(raw.vision ?? {}) },
    ideas: raw.ideas ?? [],
    activity: raw.activity ?? [],
    chat: raw.chat ?? [],
  };
}

/** Local JSON file. Good for development and for a single small server with a persistent disk. */
export class FileStore implements Store {
  private data: Workspace | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {}

  private async get(): Promise<Workspace> {
    if (!this.data) {
      try {
        this.data = withDefaults(JSON.parse(await readFile(this.path, "utf8")));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        this.data = withDefaults({});
      }
    }
    return this.data;
  }

  private async persist(ws: Workspace) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(ws, null, 1));
    await rename(tmp, this.path);
  }

  /** Serialise writes so concurrent requests can't interleave read-modify-write. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async rev() {
    return (await this.get()).rev;
  }
  async load() {
    return structuredClone(await this.get());
  }

  updateIdea(id: string, fn: (cur: Idea | undefined) => Idea | null) {
    return this.exclusive(async () => {
      const ws = await this.get();
      const i = ws.ideas.findIndex((x) => x.id === id);
      const next = fn(i >= 0 ? structuredClone(ws.ideas[i]) : undefined);
      if (next === null) {
        if (i >= 0) ws.ideas.splice(i, 1);
      } else if (i >= 0) ws.ideas[i] = next;
      else ws.ideas.push(next);
      ws.rev++;
      await this.persist(ws);
      return next;
    });
  }

  updateDoc<K extends DocKey>(key: K, fn: (cur: Docs[K]) => Docs[K]) {
    return this.exclusive(async () => {
      const ws = await this.get();
      const next = fn(structuredClone(ws[key]) as Docs[K]);
      (ws as unknown as Docs)[key] = next;
      ws.rev++;
      await this.persist(ws);
      return next;
    });
  }
}

/**
 * Firestore, for Cloud Run / Firebase. Ideas live in `<prefix>_ideas/{id}`; everything else in
 * `<prefix>_meta/{studio|members|vision|activity|chat|rev}`. Each instance caches the workspace
 * and reloads only when the shared rev counter moves, so polling costs one read.
 */
export class FirestoreStore implements Store {
  private cache: Workspace | null = null;
  private constructor(
    private db: import("firebase-admin/firestore").Firestore,
    private prefix: string,
  ) {}

  static async create(prefix = "bc") {
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) initializeApp();
    return new FirestoreStore(getFirestore(), prefix);
  }

  private ideas() {
    return this.db.collection(`${this.prefix}_ideas`);
  }
  private meta(id: string) {
    return this.db.collection(`${this.prefix}_meta`).doc(id);
  }

  async rev() {
    const snap = await this.meta("rev").get();
    return (snap.get("rev") as number | undefined) ?? 0;
  }

  async load() {
    const rev = await this.rev();
    if (this.cache && this.cache.rev === rev) return structuredClone(this.cache);
    const [ideas, studio, members, vision, activity, chat] = await Promise.all([
      this.ideas().get(),
      this.meta("studio").get(),
      this.meta("members").get(),
      this.meta("vision").get(),
      this.meta("activity").get(),
      this.meta("chat").get(),
    ]);
    this.cache = withDefaults({
      rev,
      ideas: ideas.docs.map((d) => d.data() as Idea).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      studio: studio.data()?.value,
      members: members.data()?.value,
      vision: vision.data()?.value,
      activity: activity.data()?.value,
      chat: chat.data()?.value,
    });
    return structuredClone(this.cache);
  }

  updateIdea(id: string, fn: (cur: Idea | undefined) => Idea | null) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.ideas().doc(id);
      const [snap, revSnap] = await Promise.all([tx.get(ref), tx.get(this.meta("rev"))]);
      const next = fn(snap.exists ? (snap.data() as Idea) : undefined);
      if (next === null) tx.delete(ref);
      else tx.set(ref, JSON.parse(JSON.stringify(next)));
      tx.set(this.meta("rev"), { rev: ((revSnap.get("rev") as number) ?? 0) + 1 });
      return next;
    });
  }

  updateDoc<K extends DocKey>(key: K, fn: (cur: Docs[K]) => Docs[K]) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.meta(key);
      const [snap, revSnap] = await Promise.all([tx.get(ref), tx.get(this.meta("rev"))]);
      const d = withDefaults({});
      const cur = (snap.data()?.value ?? (d as unknown as Docs)[key]) as Docs[K];
      const next = fn(cur);
      tx.set(ref, { value: JSON.parse(JSON.stringify(next)) });
      tx.set(this.meta("rev"), { rev: ((revSnap.get("rev") as number) ?? 0) + 1 });
      return next;
    });
  }
}
