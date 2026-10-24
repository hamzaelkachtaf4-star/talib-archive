import { useEffect, useState } from "react";
import { Heart, Play, Trash } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Select } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** «امتحانات الزملاء»: QCM exams colleagues of the same faculty shared. Trying one clones it into one of my modules. */
export default function PeerExams({ modules, onOpenDrill }) {
  const [data, setData] = useState(null);
  const [target, setTarget] = useState({}); // exam id -> module id
  const [msg, setMsg] = useState(null);
  const load = () => Law.sharedExams().then((r) => r.ok && setData(r.data));
  useEffect(() => { load(); }, []);

  const moduleFor = (e) => target[e.id] || (modules || []).find((m) => m.title === e.moduleTitle)?.id || modules?.[0]?.id || "";
  async function tryIt(e) {
    setMsg(null);
    const r = await Law.trySharedExam(e.id, moduleFor(e));
    if (!r.ok) return setMsg(r.offline ? tr("يحتاج اتصالا بالخادم.") : r.data?.error?.code === "too_many_open" ? tr("لديك تمارين مفتوحة كثيرة. أنهِ بعضها أو احذفه أولاً.") : tr("تعذر فتح الامتحان. أعد المحاولة."));
    load();
    onOpenDrill(r.data.drill.id, moduleFor(e));
  }
  async function helpful(e) { const r = await Law.helpfulSharedExam(e.id); if (r.ok) load(); }
  async function remove(e) { const r = await Law.removeSharedExam(e.id); if (r.ok) load(); }

  if (!data) return <p className="law-muted">…</p>;
  if (!data.exams.length) return <p className="rounded-2xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--law-border)", color: "var(--law-muted)" }}>{tr("لم ينشر أحد امتحاناً بعد. افتح تمريناً من «موادي» وانشره لزملائك.")}</p>;
  return (
    <div className="grid gap-3">
      {msg && <Notice tone="warn">{msg}</Notice>}
      {data.exams.map((e) => (
        <article key={e.id} className="law-card grid gap-3 p-4" style={e.id === data.pinnedId ? { borderColor: "var(--law-gold)" } : undefined}>
          <div>
            <h3 className="text-base font-bold"><bdi>{e.title}</bdi></h3>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi>{e.author.name}</bdi> · <bdi dir="ltr">{e.semester}</bdi> · <bdi dir="ltr">{e.questionCount}</bdi> {tr("أسئلة")} · <bdi dir="ltr">{e.tries}</bdi> {tr("جربوه")} · <bdi dir="ltr">{e.helpful}</bdi> {tr("مفيد")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={moduleFor(e)} onChange={(ev) => setTarget((t) => ({ ...t, [e.id]: ev.target.value }))} options={(modules || []).map((m) => [m.id, m.title])} aria-label={tr("في أي مادة تجربه؟")} />
            <Button3D onClick={() => tryIt(e)} disabled={!moduleFor(e)} variant="gold"><Play size={16} weight="fill" />{tr("جرب الامتحان")}</Button3D>
            <Button3D variant="neutral" onClick={() => helpful(e)} disabled={e.iHelpful || e.mine} aria-pressed={e.iHelpful}><Heart size={16} weight={e.iHelpful ? "fill" : "regular"} />{tr("مفيد")}</Button3D>
            {e.mine && <Button3D variant="neutral" onClick={() => remove(e)} aria-label={tr("إزالة")}><Trash size={16} /></Button3D>}
          </div>
        </article>
      ))}
    </div>
  );
}
