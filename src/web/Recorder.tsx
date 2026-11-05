import { useEffect, useRef, useState } from "react";

const pickType = (kind: "audio" | "video") => {
  const options = kind === "audio" ? ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] : ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
};

export const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

/** Records a voice note or a short video in the browser and hands back a File. */
export function Recorder({ kind, maxSeconds = 300, onDone, onCancel }: { kind: "audio" | "video"; maxSeconds?: number; onDone: (f: File) => void; onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const file = useRef<File | null>(null);
  const live = useRef<HTMLVideoElement>(null);

  const stopTracks = () => stream.current?.getTracks().forEach((t) => t.stop());
  useEffect(() => () => stopTracks(), []);
  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => {
      if (s + 1 >= maxSeconds) rec.current?.stop();
      return s + 1;
    }), 1000);
    return () => clearInterval(t);
  }, [state, maxSeconds]);

  const start = async () => {
    setError(undefined);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia(kind === "audio" ? { audio: true } : { audio: true, video: { facingMode: "user", width: { ideal: 1280 } } });
      if (kind === "video" && live.current) {
        live.current.srcObject = stream.current;
        live.current.play().catch(() => undefined);
      }
      const type = pickType(kind);
      const r = new MediaRecorder(stream.current, type ? { mimeType: type, ...(kind === "video" ? { videoBitsPerSecond: 1_500_000 } : {}) } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stopTracks();
        const mime = (r.mimeType || type || (kind === "audio" ? "audio/webm" : "video/webm")).split(";")[0];
        const ext = mime.includes("mp4") ? (kind === "audio" ? "m4a" : "mp4") : "webm";
        const blob = new Blob(chunks.current, { type: mime });
        file.current = new File([blob], `${kind === "audio" ? "voice" : "video"}-message.${ext}`, { type: mime });
        setUrl(URL.createObjectURL(blob));
        setState("done");
      };
      rec.current = r;
      r.start(1000);
      setSeconds(0);
      setState("recording");
    } catch {
      setError(kind === "audio" ? "We couldn't use your microphone. Check your browser's permission and try again." : "We couldn't use your camera. Check your browser's permission and try again.");
      setState("error");
    }
  };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="recorder card">
      {kind === "video" && state !== "done" && <video ref={live} muted playsInline className="recorder-live" />}
      {state === "idle" || state === "error" ? (
        <div className="row gap wrap">
          <button type="button" className="btn" onClick={start}>● Start recording</button>
          <button type="button" className="link" onClick={onCancel}>Cancel</button>
          {error && <p className="error small">{error}</p>}
        </div>
      ) : state === "recording" ? (
        <div className="row gap">
          <span className="rec-dot" aria-hidden /> <strong>{mmss}</strong> <span className="muted small">of {Math.floor(maxSeconds / 60)} min</span>
          <button type="button" className="btn secondary" onClick={() => rec.current?.stop()}>■ Stop</button>
        </div>
      ) : (
        <div className="stack">
          {kind === "audio" ? <audio src={url} controls /> : <video src={url} controls playsInline className="recorder-live" />}
          <div className="row gap wrap">
            <button type="button" className="btn" onClick={() => file.current && onDone(file.current)}>Use this recording</button>
            <button type="button" className="btn ghost" onClick={() => { setUrl(undefined); setState("idle"); }}>Record again</button>
            <button type="button" className="link" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
