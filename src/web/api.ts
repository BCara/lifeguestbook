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
