import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackLink from "@/components/LawOS/kit/BackLink";
import {
  CheckCircle,
  XCircle,
  Question,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  Textarea,
} from "@/components/LawOS/ui";
import CitationPanel from "@/components/LawOS/Method/CitationPanel";
import RefChip from "@/components/LawOS/Method/RefChip";
import { tr } from "@/components/LawOS/lib/i18n";

const INTRO = [
  tr("الإطار العام"),
  tr("الإطار الخاص والتعريف"),
  tr("الأهمية النظرية والعملية"),
  tr("التطور التاريخي"),
  tr("الإشكالية"),
  tr("الإعلان عن الخطة"),
];
const emptyPlan = () => ({
  sections: [0, 1].map((i) => ({
    title: tr("المبحث {0}:", [i === 0 ? "الأول" : "الثاني"]),
    subsections: [0, 1].map((j) => ({
      title: tr("المطلب {0}:", [j === 0 ? "الأول" : "الثاني"]),
      body: "",
    })),
  })),
});

/** Spec §8.3: 6-step intro, bipartite plan, deterministic checklist, AI critique only after a draft. */
export default function DissertationEditor() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [steps, setSteps] = useState([]);
  const [plan, setPlan] = useState(emptyPlan());
  const [draftBody, setDraftBody] = useState("");
  const [checklist, setChecklist] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const r = await Law.dissertation(id);
    if (!r.ok) return;
    const x = r.data.dissertation;
    setD(x);
    setSteps(INTRO.map((_, i) => x.intro.steps?.[i] || ""));
    setPlan(x.plan.sections?.length ? x.plan : emptyPlan());
    setDraftBody(x.draftBody || "");
    if (x.ruleViolations) setChecklist(x.ruleViolations);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (d?.status !== "critiquing") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [d?.status, load]);

  async function save() {
    const r = await Law.saveDissertation(id, {
      intro: { steps },
      plan,
      draftBody,
    });
    setMsg(r.ok ? null : r.data?.error);
    return r.ok;
  }
  async function check() {
    if (!(await save())) return;
    const r = await Law.checkDissertation(id);
    if (r.ok) setChecklist(r.data.checklist);
  }
  async function critique() {
    if (!(await save())) return;
    const r = await Law.critiqueDissertation(id);
    if (!r.ok) return setMsg(r.data?.error);
    load();
  }
  const setSub = (i, j, k) => (e) =>
    setPlan((p) => ({
      sections: p.sections.map((s, a) =>
        a !== i
          ? s
          : {
              ...s,
              subsections: s.subsections.map((x, b) =>
                b !== j ? x : { ...x, [k]: e.target.value }
              ),
            }
      ),
    }));

  if (!d) return null;
  const c = d.critique;
  return (
    <div className="flex flex-col gap-3 pb-28">
      <BackLink className="flex items-center gap-1 text-sm">{tr("المواضيع")}</BackLink>
      <h1 className="text-xl font-bold">{d.topic}</h1>
      <Card className="flex flex-col gap-3 p-3">
        <span className="font-bold">{tr("المقدمة")}</span>
        {INTRO.map((label, i) => (
          <Field key={label} label={`${i + 1}. ${label}`}>
            <Textarea
              value={steps[i] || ""}
              onChange={(e) =>
                setSteps((s) => s.map((x, k) => (k === i ? e.target.value : x)))
              }
              style={{ minHeight: "4rem" }}
            />
          </Field>
        ))}
      </Card>
      <Card className="flex flex-col gap-3 p-3">
        <span className="font-bold">{tr("التصميم")}</span>
        {plan.sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Input
              value={s.title}
              onChange={(e) =>
                setPlan((p) => ({
                  sections: p.sections.map((x, a) =>
                    a === i ? { ...x, title: e.target.value } : x
                  ),
                }))
              }
            />
            {s.subsections.map((x, j) => (
              <div key={j} className="ms-4 flex flex-col gap-1">
                <Input value={x.title} onChange={setSub(i, j, "title")} />
                <Textarea
                  value={x.body || ""}
                  onChange={setSub(i, j, "body")}
                  placeholder={tr("أفكار المطلب")}
                  style={{ minHeight: "3rem" }}
                />
              </div>
            ))}
          </div>
        ))}
      </Card>
      <Field label={tr("المسودة (اختياري)")}>
        <Textarea
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
        />
      </Field>
      {checklist && (
        <Card className="flex flex-col gap-1 p-3 text-sm">
          {checklist.map((x) => (
            <div key={x.id} className="flex items-start gap-2">
              {x.ok ? (
                <CheckCircle size={18} style={{ color: "var(--law-ok)" }} />
              ) : x.needsConfirmation ? (
                <Question size={18} style={{ color: "var(--law-warn)" }} />
              ) : (
                <XCircle size={18} style={{ color: "var(--law-danger)" }} />
              )}
              <span>
                {x.message}
                {x.needsConfirmation && x.details?.length > 0 && (
                  <span className="law-muted block text-xs">
                    {x.details.join(" · ")}
                  </span>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}
      {msg && <Notice tone="warn">{msg}</Notice>}
      {d.status === "critiquing" && <Notice>{tr("جارٍ التصحيح…")}</Notice>}
      {c && (
        <Card className="flex flex-col gap-2 p-3">
          <span className="font-bold">{tr("التصحيح")}</span>
          <CitationPanel check={d.citationCheck} />
          {(c.intro || []).map((x, i) => (
            <p key={i} className="text-sm">
              <b>{x.step}:</b> {x.comment}
            </p>
          ))}
          {c.plan && <p className="text-sm">{c.plan}</p>}
          {(c.content?.missing || []).map((x, i) => (
            <p key={i} className="text-sm" style={{ color: "var(--law-warn)" }}>
              {tr("ناقص:")} {x}
            </p>
          ))}
          {(c.content?.wrong || []).map((x, i) => (
            <p key={i} className="text-sm" style={{ color: "var(--law-danger)" }}>
              {tr("خطأ:")} {x}
            </p>
          ))}
          <div className="flex flex-wrap gap-1">
            {(c.content?.rules || []).map((r) => (
              <RefChip key={r.canonicalId} r={r} />
            ))}
          </div>
          <p className="leading-8">{c.overall}</p>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={save}>
          {tr("حفظ")}
        </Button>
        <Button variant="secondary" onClick={check}>
          {tr("فحص القواعد")}
        </Button>
        <Button onClick={critique} disabled={d.status === "critiquing"}>
          {tr("طلب التصحيح")}
        </Button>
      </div>
    </div>
  );
}
