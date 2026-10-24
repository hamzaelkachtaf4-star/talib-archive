import { useEffect, useRef, useState } from "react";
import { ArrowRight, Warning } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Notice, Textarea, Input } from "../ui";
import { formatClock } from "../lib/media";
import CandidateAtomReview from "./CandidateAtomReview";
import { tr } from "@/components/LawOS/lib/i18n";

const KIND_LABELS = {
  ocr_text: tr("نص الصفحات"),
  transcript: tr("تفريغ المحاضرة"),
  segments: tr("مواضيع المحاضرة"),
  candidate_atoms: tr("أفكار مقترحة للحفظ"),
  polycopie_map: tr("ربط المطبوع بالتصميم"),
};

// Spec §1.3: AI output stays visibly unverified until the student confirms it.
function UnverifiedBanner() {
  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-xl p-3 text-sm"
      style={{ background: "var(--law-surface-2)", color: "var(--law-warn)" }}
    >
      <Warning size={18} />{" "}
      {tr("نص آلي غير مُتحقق منه. قارنه بالأصل قبل القبول.")}
    </div>
  );
}

function OcrPages({ derivative, pages, setPages }) {
  const byId = Object.fromEntries(derivative.assets.map((a) => [a.id, a]));
  return pages.map((p, i) => (
    <Card key={i} className="mb-3 grid gap-3 p-3 lg:grid-cols-2">
      {p.assetId && byId[p.assetId] ? (
        <a href={byId[p.assetId].url} target="_blank" rel="noreferrer">
          <img
            src={byId[p.assetId].url}
            alt={tr("صفحة {0}", [i + 1])}
            className="w-full rounded-lg"
            loading="lazy"
          />
        </a>
      ) : (
        <span className="law-muted text-xs">
          {tr("صفحة")} <bdi dir="ltr">{p.page ?? i + 1}</bdi>{" "}
          {p.method === "vision" ? tr("(قراءة آلية)") : ""}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <Textarea
          dir="auto"
          value={p.text}
          style={{ minHeight: "14rem" }}
          onChange={(e) =>
            setPages(
              pages.map((x, j) =>
                j === i ? { ...x, text: e.target.value } : x
              )
            )
          }
        />
        {p.illegible?.length > 0 && (
          <span className="text-xs" style={{ color: "var(--law-warn)" }}>
            {tr("مقاطع غير مقروءة:")} <bdi dir="ltr">{p.illegible.length}</bdi>
          </span>
        )}
      </div>
    </Card>
  ));
}

function Transcript({ derivative, segments, setSegments }) {
  const audio = useRef(null);
  const [assetId, setAssetId] = useState(derivative.assets[0]?.id);
  const asset = derivative.assets.find((a) => a.id === assetId);

  function seek(s) {
    setAssetId(s.assetId);
    requestAnimationFrame(() => {
      if (!audio.current) return;
      audio.current.currentTime = s.assetStart ?? s.start;
      audio.current.play().catch(() => {});
    });
  }

  return (
    <>
      {asset && (
        <div
          className="sticky top-16 z-10 mb-3 rounded-xl p-2"
          style={{ background: "var(--law-bg)" }}
        >
          <audio
            ref={audio}
            key={asset.id}
            src={asset.url}
            controls
            preload="none"
            className="w-full"
          />
        </div>
      )}
      {segments.map((s, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => seek(s)}
            className="law-btn law-btn-secondary shrink-0 tabular-nums"
            style={{ minHeight: 36, padding: "0 0.6rem" }}
          >
            <bdi dir="ltr">{formatClock(s.start)}</bdi>
          </button>
          <Textarea
            dir="auto"
            value={s.text}
            style={{ minHeight: "3.5rem" }}
            onChange={(e) =>
              setSegments(
                segments.map((x, j) =>
                  j === i ? { ...x, text: e.target.value } : x
                )
              )
            }
          />
        </div>
      ))}
    </>
  );
}

function Topics({ topics, setTopics }) {
  return topics.map((t, i) => (
    <div key={i} className="mb-2 flex items-center gap-2">
      <span className="law-muted w-28 shrink-0 text-xs tabular-nums">
        <bdi dir="ltr">
          {formatClock(t.startSec)}–{formatClock(t.endSec)}
        </bdi>
      </span>
      <Input
        value={t.title}
        onChange={(e) =>
          setTopics(
            topics.map((x, j) =>
              j === i ? { ...x, title: e.target.value } : x
            )
          )
        }
      />
    </div>
  ));
}

export default function DerivativeReview({ id, onBack, subjects = [] }) {
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    Law.derivative(id).then((r) => {
      if (r.ok) {
        setD(r.data.derivative);
        setDraft(r.data.derivative.content);
      } else
        setMsg(
          r.offline ? tr("المراجعة تحتاج اتصالا بالخادم.") : tr("تعذر التحميل.")
        );
    });
  }, [id]);

  const update = (key) => (value) => {
    setDraft((c) => ({ ...c, [key]: value }));
    setDirty(true);
  };

  async function decide(status) {
    const body =
      dirty && status !== "rejected"
        ? { content: draft }
        : { verificationStatus: status };
    const r = await Law.updateDerivative(id, body);
    if (r.ok) onBack(true);
    else setMsg(r.data?.error || tr("تعذر الحفظ."));
  }

  if (!d)
    return (
      <>
        <button
          type="button"
          onClick={() => onBack(false)}
          className="mb-3 flex items-center gap-1 text-sm"
        >
          <ArrowRight size={18} className="law-flip" /> {tr("رجوع")}
        </button>
        {msg && <Notice tone="warn">{msg}</Notice>}
      </>
    );

  if (d.kind === "candidate_atoms")
    return (
      <div className="pb-44 lg:pb-0">
        <button
          type="button"
          onClick={() => onBack(false)}
          className="mb-3 flex items-center gap-1 text-sm"
        >
          <ArrowRight size={18} className="law-flip" /> {tr("صندوق الوارد")}
        </button>
        <h2 className="mb-2 text-lg font-bold">{KIND_LABELS[d.kind]}</h2>
        <CandidateAtomReview
          derivative={d}
          subjects={subjects}
          onDone={onBack}
        />
      </div>
    );

  return (
    <div className="pb-44 lg:pb-0">
      <button
        type="button"
        onClick={() => onBack(false)}
        className="mb-3 flex items-center gap-1 text-sm"
      >
        <ArrowRight size={18} className="law-flip" /> {tr("صندوق الوارد")}
      </button>
      <h2 className="mb-2 text-lg font-bold">
        {KIND_LABELS[d.kind] || d.kind}
      </h2>
      {d.verificationStatus === "unverified" && <UnverifiedBanner />}
      {d.kind === "ocr_text" && (
        <OcrPages
          derivative={d}
          pages={draft.pages || []}
          setPages={update("pages")}
        />
      )}
      {d.kind === "transcript" && (
        <Transcript
          derivative={d}
          segments={draft.segments || []}
          setSegments={update("segments")}
        />
      )}
      {d.kind === "segments" && (
        <Topics topics={draft.topics || []} setTopics={update("topics")} />
      )}
      {d.kind === "polycopie_map" &&
        (draft.pages || []).map((p) => (
          <p key={p.page} className="mb-2 text-sm">
            {tr("صفحة")} <bdi dir="ltr">{p.page}</bdi>:{" "}
            <span className="law-muted">
              {p.headingPath.join(" › ") || tr("بدون عنوان")}
            </span>
          </p>
        ))}
      {msg && <Notice tone="warn">{msg}</Notice>}
      <div
        className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex gap-2 p-3 shadow-lg lg:static lg:p-0 lg:shadow-none"
        style={{ background: "var(--law-surface)" }}
      >
        <Button className="flex-1" onClick={() => decide("verified")}>
          {dirty ? tr("حفظ التعديلات وقبول") : tr("قبول")}
        </Button>
        <Button variant="danger" onClick={() => decide("rejected")}>
          {tr("رفض")}
        </Button>
      </div>
    </div>
  );
}
