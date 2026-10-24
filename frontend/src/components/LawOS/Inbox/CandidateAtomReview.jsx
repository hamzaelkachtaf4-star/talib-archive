import { useState } from "react";
import { Star } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Notice, Textarea } from "../ui";
import SubjectPicker from "../Capture/SubjectPicker";
import { formatClock } from "../lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

/**
 * Candidate atoms (spec §6.3, §9.3): proposals are NOT pre-selected. The student chooses what deserves to
 * become study content, edits the wording, and accepts. Accepted atoms appear in Exam Mode.
 */
export default function CandidateAtomReview({ derivative, subjects, onDone }) {
  const content = derivative.content;
  const accepted = new Set(content.accepted || []);
  const [sel, setSel] = useState({});
  const [subjectId, setSubjectId] = useState("");
  const [msg, setMsg] = useState(null);
  const needsSubject = !derivative.batch?.subjectId;

  async function accept() {
    const atoms = Object.entries(sel)
      .filter(([, v]) => v.on)
      .map(([i, v]) => ({
        index: Number(i),
        ...(v.body !== undefined && { body: v.body }),
      }));
    const r = await Law.acceptAtoms(derivative.id, {
      atoms,
      ...(needsSubject && { subjectId }),
    });
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر القبول"));
    onDone(true);
  }

  const count = Object.values(sel).filter((v) => v.on).length;
  return (
    <div className="flex flex-col gap-3">
      <Notice>
        {tr(
          "اختر فقط ما يستحق الحفظ: التعاريف، الشروط، الآجال، وما أكد عليه الأستاذ. يمكنك تعديل الصياغة."
        )}
      </Notice>
      {needsSubject && (
        <SubjectPicker
          subjects={subjects}
          value={subjectId}
          onChange={setSubjectId}
        />
      )}
      {content.atoms.map((a, i) => {
        const done = accepted.has(i);
        const s = sel[i] || {};
        return (
          <Card
            key={i}
            className="flex flex-col gap-2 p-3"
            style={{ opacity: done ? 0.5 : 1 }}
          >
            <label className="flex min-h-[44px] items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                disabled={done}
                checked={done || !!s.on}
                onChange={(e) =>
                  setSel((x) => ({ ...x, [i]: { ...s, on: e.target.checked } }))
                }
              />
              <span className="flex-1 text-sm">
                {a.profEmphasis && (
                  <Star
                    size={14}
                    weight="fill"
                    className="inline"
                    style={{ color: "var(--law-accent)" }}
                  />
                )}{" "}
                <span className="law-muted text-xs">
                  {a.sourceTimestampSec != null ? (
                    <bdi dir="ltr">{formatClock(a.sourceTimestampSec)}</bdi>
                  ) : (
                    tr("صفحة {0}", [a.sourcePage])
                  )}
                </span>
              </span>
            </label>
            <Textarea
              value={s.body ?? a.body}
              disabled={done}
              style={{ minHeight: "3.5rem" }}
              onChange={(e) =>
                setSel((x) => ({
                  ...x,
                  [i]: { ...s, on: true, body: e.target.value },
                }))
              }
            />
            <details className="law-muted text-xs">
              <summary>{tr("المقطع الأصلي")}</summary>
              <p className="mt-1 leading-6">{a.sourceExcerpt}</p>
            </details>
          </Card>
        );
      })}
      {msg && <Notice tone="warn">{msg}</Notice>}
      <div
        className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex gap-2 p-3 shadow-lg lg:static lg:p-0 lg:shadow-none"
        style={{ background: "var(--law-surface)" }}
      >
        <Button
          className="flex-1"
          onClick={accept}
          disabled={!count || (needsSubject && !subjectId)}
        >
          {tr("قبول")} <bdi dir="ltr">{count}</bdi>
        </Button>
        <Button variant="secondary" onClick={() => onDone(false)}>
          {tr("لاحقا")}
        </Button>
      </div>
    </div>
  );
}
