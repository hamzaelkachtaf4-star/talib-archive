import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  LockSimple,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "@/components/LawOS/EmptyState";
import { Button, Card, Notice, Select, Textarea } from "@/components/LawOS/ui";
import AtomCard from "@/components/LawOS/Notes/AtomCard";
import AudioJump from "@/components/LawOS/Notes/AudioJump";
import CoursePlanEditor from "@/components/LawOS/Notes/CoursePlanEditor";
import { AngleTiles, SchemasView, TablesView } from "@/components/LawOS/Notes/StudyAngles";
import SubjectForm from "@/components/LawOS/Subjects/SubjectForm";
import * as idb from "@/components/LawOS/lib/idb";
import { tr } from "@/components/LawOS/lib/i18n";

const MODE_KEY = (id) => `lawos_mode_${id}`;
const TABS = [
  ["content", tr("المحتوى")],
  ["plan", tr("التصميم")],
  ["sessions", tr("الحصص")],
];

function flattenPlan(tree, prefix = []) {
  return (tree || []).flatMap((n) => [
    [...prefix, n.title],
    ...flattenPlan(n.children, [...prefix, n.title]),
  ]);
}

/** Exam Mode: atoms under the professor's headings, in plan order. */
function ExamList({ atoms, onPlay }) {
  let lastHeading = null;
  return atoms.map((a) => {
    const heading = a.headingPath?.length ? a.headingPath.join(" › ") : null;
    const showHeading = heading && heading !== lastHeading;
    lastHeading = heading;
    return (
      <div key={a.id}>
        {showHeading && (
          <h3 className="law-muted mb-2 mt-4 text-sm font-bold">{heading}</h3>
        )}
        <div className="mb-2">
          <AtomCard atom={a} onPlay={onPlay} mode="exam" />
        </div>
      </div>
    );
  });
}

function NewNote({ subject, onAdded }) {
  const [body, setBody] = useState("");
  const [heading, setHeading] = useState("");
  const paths = flattenPlan(subject.coursePlan);
  async function add() {
    const r = await Law.createAtom({
      subjectId: subject.id,
      provenance: "MINE",
      body,
      headingPath: heading ? JSON.parse(heading) : [],
    });
    if (r.ok) {
      setBody("");
      onAdded();
    }
  }
  return (
    <Card className="mb-4 flex flex-col gap-2 p-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tr("ملاحظتي (تركيب شخصي)")}
        style={{ minHeight: "4rem" }}
      />
      {paths.length > 0 && (
        <Select
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          options={[
            ["", tr("بدون عنوان")],
            ...paths.map((p) => [JSON.stringify(p), p.join(" › ")]),
          ]}
        />
      )}
      <Button
        onClick={add}
        disabled={!body.trim()}
        className="self-start"
        style={{ minHeight: 36 }}
      >
        <Plus size={16} /> {tr("إضافة")}
      </Button>
    </Card>
  );
}

export default function SubjectView() {
  const { id } = useParams();
  const [tab, setTab] = useState("content");
  const [angle, setAngle] = useState("summaries");
  const navigate = useNavigate();
  const viewAtoms = data?.atoms ?? data?.groups?.flatMap((g) => g.atoms) ?? [];
  const pickAngle = (k) => (k === "cards" ? navigate("/law/exam") : setAngle(k));
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null);
  const [offline, setOffline] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(
    async (m) => {
      const r = await Law.subjectContent(id, m || undefined);
      if (r.ok) {
        setOffline(false);
        setData(r.data);
        setMode(r.data.mode);
        return;
      }
      // Offline: Exam Mode from the offline pack (spec §1.9).
      const atoms = ((await idb.getMeta("examAtoms")) || []).filter(
        (a) => a.subjectId === id
      );
      const subjects = [
        ...((await idb.getMeta("subjects")) || []),
        ...(((await idb.getMeta("pack")) || {}).subjects || []),
      ];
      setOffline(true);
      setMode("exam");
      setData({
        subject: subjects.find((s) => s.id === id) || { id, name: "" },
        mode: "exam",
        atoms,
        offline: true,
      });
    },
    [id]
  );

  useEffect(() => {
    // Lockdown overrides the remembered default; otherwise the device remembers the student's choice.
    (async () => {
      const r = await Law.subjectContent(id);
      const remembered = localStorage.getItem(MODE_KEY(id));
      if (r.ok && !r.data.lockdown && remembered && remembered !== r.data.mode)
        return load(remembered);
      if (r.ok) {
        setData(r.data);
        setMode(r.data.mode);
      } else load();
    })();
    Law.sessions({ subjectId: id }).then(
      (r) => r.ok && setSessions(r.data.sessions)
    );
  }, [id, load]);

  function switchMode(m) {
    try {
      localStorage.setItem(MODE_KEY(id), m);
    } catch {}
    load(m);
  }

  async function togglePin(atom) {
    const r = await Law.updateAtom(atom.id, {
      mentionBridge: !atom.mentionBridge,
    });
    if (!r.ok) setMsg(r.data?.error);
    else {
      setMsg(null);
      load(mode);
    }
  }

  if (!data) return null;
  const s = data.subject;

  if (editing)
    return (
      <Card className="p-4">
        <SubjectForm
          subject={s}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            const r = await Law.updateSubject(s.id, body);
            if (!r.ok) return r.data?.error || tr("تعذر الحفظ");
            setEditing(false);
            load(mode);
            return null;
          }}
        />
      </Card>
    );

  return (
    <div className="pb-24">
      <Link to="/law/path" className="mb-3 flex items-center gap-1 text-sm">
        <ArrowRight size={18} className="law-flip" /> {tr("المواد")}
      </Link>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{s.name}</h1>
          {s.professorName && (
            <p className="law-muted text-sm">{s.professorName}</p>
          )}
        </div>
        {!offline && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={tr("تعديل")}
            className="law-muted h-11 w-11"
          >
            <PencilSimple size={20} className="mx-auto" />
          </button>
        )}
      </div>
      {data.lockdown && (
        <Card
          className="mb-3 flex items-center gap-2 p-3 text-sm"
          style={{ borderColor: "var(--law-warn)" }}
        >
          <LockSimple size={18} style={{ color: "var(--law-warn)" }} />
          {tr("الامتحان بعد")} <bdi dir="ltr">{s.daysToExam}</bdi>{" "}
          {tr("يوم: المادة تُفتح في نسخة الامتحان. نسخة الباحث متاحة بلمسة.")}
        </Card>
      )}
      {offline && (
        <Notice tone="warn">
          {tr("بدون اتصال: نسخة الامتحان المحفوظة على الهاتف.")}
        </Notice>
      )}

      <div
        className="mb-3 flex gap-1 rounded-xl p-1"
        style={{ background: "var(--law-surface-2)" }}
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            disabled={offline && key !== "content"}
            className="min-h-[40px] flex-1 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={
              tab === key
                ? { background: "var(--law-surface)" }
                : { color: "var(--law-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          <AngleTiles angle={angle} onPick={pickAngle} />
          {angle === "schemas" && (viewAtoms.length ? <SchemasView atoms={viewAtoms} /> : <EmptyState title={tr("لا محتوى مقبول بعد")} />)}
          {angle === "tables" && (viewAtoms.length ? <TablesView atoms={viewAtoms} /> : <EmptyState title={tr("لا محتوى مقبول بعد")} />)}
          {angle === "summaries" && (<>
          <div
            className="mb-3 grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label={tr("العدسة")}
          >
            {[
              ["exam", tr("نسخة الامتحان"), tr("الأستاذ + النص")],
              ["jurist", tr("نسخة الباحث"), tr("اجتهاد، فقه، تعارضات")],
            ].map(([m, label, sub]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={offline && m === "jurist"}
                onClick={() => switchMode(m)}
                className="law-card flex flex-col items-center gap-0.5 p-2 disabled:opacity-40"
                style={
                  mode === m
                    ? {
                        background: "var(--law-primary)",
                        color: "var(--law-on-primary)",
                      }
                    : undefined
                }
              >
                <span className="text-sm font-bold">{label}</span>
                <span className="text-[11px] opacity-80">{sub}</span>
              </button>
            ))}
          </div>
          {msg && <Notice tone="warn">{msg}</Notice>}
          {mode === "exam" &&
            (data.atoms?.length ? (
              <ExamList atoms={data.atoms} onPlay={setPlaying} />
            ) : (
              <EmptyState title={tr("لا محتوى مقبول بعد")}>
                {tr(
                  "تظهر هنا أفكار الأستاذ والنصوص بعد قبولها من صندوق الوارد، مرتبة حسب تصميم الأستاذ."
                )}
              </EmptyState>
            ))}
          {mode === "jurist" && (
            <>
              <NewNote subject={s} onAdded={() => load("jurist")} />
              {!data.groups?.length && (
                <EmptyState title={tr("لا ملاحظات بعد")}>
                  {tr("أضف ملاحظاتك، أو اربط قرارات ومراجع فقهية بالموضوع.")}
                </EmptyState>
              )}
              {data.groups?.map((g) => (
                <section key={g.topic} className="mb-5">
                  <h3 className="mb-2 flex items-center justify-between text-sm font-bold">
                    <span>{g.topic}</span>
                    {g.bridge.length > 0 && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--law-accent)" }}
                      >
                        {tr("إضافات التميّز:")}{" "}
                        <bdi dir="ltr">{g.bridge.length}/2</bdi>
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {g.atoms.map((a) => (
                      <AtomCard
                        key={a.id}
                        atom={a}
                        onPlay={setPlaying}
                        onPin={togglePin}
                        mode="jurist"
                      />
                    ))}
                  </div>
                </section>
              ))}
              {data.conflicts?.length > 0 && (
                <Notice>
                  {tr("تعارضات مسجلة:")}{" "}
                  <bdi dir="ltr">{data.conflicts.length}</bdi>
                </Notice>
              )}
            </>
          )}
          </>)}
        </>
      )}
      {tab === "plan" && (
        <CoursePlanEditor subject={s} onSaved={() => load(mode)} />
      )}
      {tab === "sessions" &&
        (sessions.length ? (
          sessions.map((x) => (
            <Card key={x.id} className="mb-2 flex justify-between p-3 text-sm">
              <span>{x.title || x.date}</span>
              <span className="law-muted">
                {x.status === "reviewed"
                  ? tr("رُوجعت")
                  : x.status === "needs_review"
                    ? tr("بانتظار المراجعة")
                    : tr("قيد المعالجة")}
              </span>
            </Card>
          ))
        ) : (
          <EmptyState title={tr("لا حصص مسجلة")}>
            {tr("الحصص تُنشأ تلقائيا عند الالتقاط أثناء وقت المادة في الجدول.")}
          </EmptyState>
        ))}
      {playing && <AudioJump atom={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
