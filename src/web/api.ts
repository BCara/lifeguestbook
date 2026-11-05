export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(body.error ?? "Something went wrong. Please try again."), res.status, body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => fetch(`/api${path}`, { credentials: "include" }).then((r) => handle<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    fetch(`/api${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body: unknown) =>
    fetch(`/api${path}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => handle<T>(r)),
  del: <T>(path: string, body?: unknown) =>
    fetch(`/api${path}`, { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  form: <T>(path: string, form: FormData) => fetch(`/api${path}`, { method: "POST", credentials: "include", body: form }).then((r) => handle<T>(r)),
};

/** Upload with progress (fetch has no upload progress). */
export function uploadForm<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(String(body.error ?? "Upload failed. Please try again."), xhr.status, body));
    };
    xhr.onerror = () => reject(new ApiError("Connection lost. Please check your signal and try again.", 0));
    xhr.send(form);
  });
}

const DIRECT_LIMIT = 25 * 1024 * 1024;

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (i >= tries - 1 || (status >= 400 && status < 500 && status !== 408 && status !== 429)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

function putChunk(path: string, blob: Blob, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "Upload failed";
      try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch { /* not JSON */ }
      reject(new ApiError(msg, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Connection lost.", 0));
    xhr.send(blob);
  });
}

/** Posts a contribution. Files over 25 MB go up first in retried 8 MB chunks. */
export async function sendContribution<T>(slug: string, fields: Record<string, string>, file: File | null, onProgress: (fraction: number) => void): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file && file.size > DIRECT_LIMIT) {
    const start = await api.post<{ uploadId: string; chunkBytes: number; chunks: number }>(`/m/${slug}/uploads`, { size: file.size, type: file.type });
    for (let i = 0; i < start.chunks; i++) {
      const blob = file.slice(i * start.chunkBytes, Math.min(file.size, (i + 1) * start.chunkBytes));
      await withRetry(() => putChunk(`/m/${slug}/uploads/${start.uploadId}/${i}`, blob, (p) => onProgress(Math.min(0.98, (i + p) / start.chunks))));
    }
    form.append("uploadId", start.uploadId);
    return withRetry(() => uploadForm<T>(`/m/${slug}/contributions`, form, () => onProgress(0.99)), 2);
  }
  if (file) form.append("file", file);
  return uploadForm<T>(`/m/${slug}/contributions`, form, onProgress);
}
