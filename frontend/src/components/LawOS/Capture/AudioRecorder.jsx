import { useEffect, useRef, useState } from "react";
import { Microphone, Stop } from "@phosphor-icons/react";
import { Button, Notice } from "../ui";
import { formatClock } from "../lib/media";
import {
  openRecording,
  addRecordingSegment,
  closeRecording,
} from "../lib/captureQueue";
import SubjectPicker from "./SubjectPicker";
import { tr } from "@/components/LawOS/lib/i18n";

const SEGMENT_MS = 5 * 60 * 1000; // a crash or killed tab loses at most one segment (spec §6.1)

function pickMime() {
  for (const m of [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ])
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

const now = () => Date.now();

/**
 * Segmented recorder: each 5-minute segment is an independent file saved to IndexedDB as soon as it
 * closes. A Screen Wake Lock is held while recording (Android may suspend recording on screen lock).
 */
export default function AudioRecorder({ subjects, onDone }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState(0);
  const [level, setLevel] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [error, setError] = useState(null);
  const r = useRef({});

  useEffect(() => () => stopAll(), []);

  async function acquireWakeLock() {
    try {
      r.current.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      // not fatal: the warning below tells the student to keep the screen on
    }
  }

  function startSegment() {
    const s = r.current;
    const rec = new MediaRecorder(
      s.stream,
      s.mime ? { mimeType: s.mime, audioBitsPerSecond: 32000 } : undefined
    );
    const chunks = [];
    const startedAt = now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, {
        type: (s.mime || rec.mimeType || "audio/webm").split(";")[0],
      });
      const index = s.segmentIndex++;
      if (blob.size) {
        await addRecordingSegment(
          s.batch,
          blob,
          index,
          (now() - startedAt) / 1000
        );
        setSegments(index + 1);
      } else s.segmentIndex--;
      if (s.active) startSegment();
      else s.onFinished?.();
    };
    rec.start(10000); // flush data every 10 s so a stop always has content
    s.recorder = rec;
    s.segmentTimer = setTimeout(
      () => rec.state === "recording" && rec.stop(),
      SEGMENT_MS
    );
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      const s = r.current;
      s.stream = stream;
      s.mime = pickMime();
      s.batch = await openRecording({ subjectId });
      window.__lawosActiveRecording = s.batch.clientBatchId;
      s.segmentIndex = 0;
      s.active = true;
      s.startedAt = now();
      await acquireWakeLock();
      s.onVisible = () =>
        document.visibilityState === "visible" && s.active && acquireWakeLock();
      document.addEventListener("visibilitychange", s.onVisible);
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      s.audioCtx = ctx;
      const tickLevel = () => {
        if (!s.active) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        setElapsed((now() - s.startedAt) / 1000);
        s.raf = requestAnimationFrame(tickLevel);
      };
      tickLevel();
      setSegments(0);
      setRecording(true);
      startSegment();
    } catch {
      setError(tr("تعذر الوصول إلى الميكروفون. اسمح للتطبيق باستعماله."));
    }
  }

  function stopAll() {
    const s = r.current;
    if (!s.active) return;
    s.active = false;
    clearTimeout(s.segmentTimer);
    cancelAnimationFrame(s.raf);
    document.removeEventListener("visibilitychange", s.onVisible);
    s.wakeLock?.release?.().catch?.(() => {});
    s.audioCtx?.close?.();
    if (s.recorder?.state === "recording") s.recorder.stop();
    else s.onFinished?.();
  }

  function stop() {
    const s = r.current;
    s.onFinished = async () => {
      s.stream?.getTracks().forEach((t) => t.stop());
      await closeRecording(s.batch, s.segmentIndex);
      window.__lawosActiveRecording = null;
      setRecording(false);
      setLevel(0);
      onDone?.();
    };
    stopAll();
  }

  if (!window.MediaRecorder)
    return (
      <Notice tone="warn">
        {tr(
          "هذا المتصفح لا يدعم التسجيل. استعمل مسجل الهاتف ثم «استيراد ملف»."
        )}
      </Notice>
    );

  return (
    <div className="flex flex-col gap-3">
      {!recording && (
        <SubjectPicker
          subjects={subjects}
          value={subjectId}
          onChange={setSubjectId}
        />
      )}
      <div className="law-card flex flex-col items-center gap-4 p-6">
        <span className="text-4xl font-bold tabular-nums">
          <bdi dir="ltr">{formatClock(elapsed)}</bdi>
        </span>
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: "var(--law-surface-2)" }}
        >
          <div
            className="h-2 rounded-full"
            style={{
              width: `${level * 100}%`,
              background: "var(--law-accent)",
              transition: "width 80ms",
            }}
          />
        </div>
        {recording ? (
          <Button
            variant="danger"
            onClick={stop}
            className="w-full"
            style={{ minHeight: 56 }}
          >
            <Stop size={22} weight="fill" /> {tr("إيقاف التسجيل")}
          </Button>
        ) : (
          <>
            <p className="mb-2 text-xs leading-6" style={{ color: "var(--law-muted)" }}>
              {tr("سجّل فقط بإذن الأستاذ، وللاستعمال الشخصي في الدراسة. لا تنشر التسجيل ولا تشاركه.")}
            </p>
            <Button onClick={start} className="w-full" style={{ minHeight: 56 }}>
              <Microphone size={22} weight="fill" /> {tr("بدء التسجيل")}
            </Button>
          </>
        )}
        {recording && (
          <span className="law-muted text-xs">
            {tr("محفوظ:")} <bdi dir="ltr">{segments}</bdi>{" "}
            {tr("مقطع (كل 5 دقائق)")}
          </span>
        )}
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      <Notice>
        {tr(
          "أبقِ الشاشة مضاءة أثناء التسجيل: قد يوقف Android التسجيل عند قفل الشاشة. لمحاضرة كاملة (90 دقيقة)، الأضمن هو مسجل الهاتف الأصلي ثم «استيراد ملف»."
        )}
      </Notice>
    </div>
  );
}
