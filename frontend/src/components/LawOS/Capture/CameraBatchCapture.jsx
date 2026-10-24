import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash,
  Images,
  Aperture,
  X,
} from "@phosphor-icons/react";
import { Button, Notice } from "../ui";
import { resizeImage } from "../lib/media";
import { queuePhotoBatch } from "../lib/captureQueue";
import SubjectPicker from "./SubjectPicker";
import { tr } from "@/components/LawOS/lib/i18n";

/**
 * Multi-page capture (spec §6.1): in-app camera (getUserMedia) for fast successive shots, plus the
 * gallery. Pages can be reordered and removed before submitting. Every page is resized on the phone.
 */
export default function CameraBatchCapture({ subjects, onDone }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [pages, setPages] = useState([]);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState(null);
  const [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );
  useEffect(
    () => () => pages.forEach((p) => URL.revokeObjectURL(p.url)),
    // revoke on unmount only

    []
  );

  async function openCamera() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      setCamera(true);
      requestAnimationFrame(() => {
        if (video.current) video.current.srcObject = stream.current;
      });
    } catch {
      setError(
        tr(
          "تعذر فتح الكاميرا. استعمل زر المعرض أو اسمح للتطبيق باستعمال الكاميرا."
        )
      );
    }
  }

  function closeCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  }

  async function addPage(result) {
    setPages((all) => [
      ...all,
      {
        ...result,
        url: URL.createObjectURL(result.blob),
        id: crypto.randomUUID(),
      },
    ]);
  }

  async function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    addPage(await resizeImage(canvas));
  }

  async function fromGallery(e) {
    const files = [...(e.target.files || [])].filter((f) =>
      f.type.startsWith("image/")
    );
    e.target.value = "";
    for (const f of files) addPage(await resizeImage(f));
  }

  function move(i, d) {
    setPages((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    closeCamera();
    await queuePhotoBatch(pages, { subjectId });
    setBusy(false);
    setPages([]);
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {camera && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className="min-h-0 flex-1 object-contain"
          />
          <div className="law-safe-bottom flex items-center justify-between px-6 py-4">
            <button
              type="button"
              onClick={closeCamera}
              className="flex h-12 w-12 items-center justify-center text-white"
              aria-label={tr("إغلاق")}
            >
              <X size={28} />
            </button>
            <button
              type="button"
              onClick={shoot}
              aria-label={tr("التقاط صفحة")}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white"
            >
              <Aperture size={36} />
            </button>
            <span className="w-12 text-center text-lg font-bold text-white tabular-nums">
              <bdi dir="ltr">{pages.length}</bdi>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={openCamera}>
          <Aperture size={20} /> {tr("الكاميرا")}
        </Button>
        <label className="law-btn law-btn-secondary cursor-pointer">
          <Images size={20} /> {tr("المعرض")}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={fromGallery}
          />
        </label>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}

      {pages.length > 0 && (
        <>
          <ol className="flex flex-col gap-2">
            {pages.map((p, i) => (
              <li key={p.id} className="law-card flex items-center gap-3 p-2">
                <img
                  src={p.url}
                  alt=""
                  className="h-16 w-12 rounded object-cover"
                />
                <span className="flex-1 text-sm font-semibold">
                  {tr("صفحة")} <bdi dir="ltr">{i + 1}</bdi>
                </span>
                <button
                  type="button"
                  aria-label={tr("أعلى")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="h-11 w-11 disabled:opacity-30"
                >
                  <ArrowUp size={20} className="mx-auto" />
                </button>
                <button
                  type="button"
                  aria-label={tr("أسفل")}
                  disabled={i === pages.length - 1}
                  onClick={() => move(i, 1)}
                  className="h-11 w-11 disabled:opacity-30"
                >
                  <ArrowDown size={20} className="mx-auto" />
                </button>
                <button
                  type="button"
                  aria-label={tr("حذف")}
                  onClick={() =>
                    setPages((all) => all.filter((x) => x.id !== p.id))
                  }
                  className="law-muted h-11 w-11"
                >
                  <Trash size={20} className="mx-auto" />
                </button>
              </li>
            ))}
          </ol>
          <SubjectPicker
            subjects={subjects}
            value={subjectId}
            onChange={setSubjectId}
          />
          <Button onClick={submit} disabled={busy} style={{ minHeight: 52 }}>
            {tr("حفظ")} <bdi dir="ltr">{pages.length}</bdi> {tr("صفحة")}
          </Button>
        </>
      )}
    </div>
  );
}
