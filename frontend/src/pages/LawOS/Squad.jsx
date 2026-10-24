import { useEffect, useState } from "react";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import { Link } from "react-router-dom";
import { Copy, Check, UsersThree, SignOut, X, Files, Lock, GlobeHemisphereWest } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Field, Input, Notice } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Avatar from "@/components/LawOS/Squad/Avatar";
import { tr } from "@/components/LawOS/lib/i18n";

export const SQUAD_ERRORS = {
  consent_required: tr("وافق على الإشعار القانوني أولاً (أعد تحميل الصفحة)."),
  invalid_invite_code: tr("رمز الدعوة غير صحيح."),
  squad_full: tr("هذه الفرقة مكتملة (6 أعضاء كحد أقصى)."),
  already_in_squad: tr("أنت عضو في فرقة أخرى. غادرها أولاً."),
  already_member: tr("أنت عضو في هذه الفرقة."),
  too_many_attempts: tr("محاولات كثيرة. انتظر بضع دقائق."),
  owner_only: tr("هذا الإجراء لمنشئ الفرقة أو لصاحب المحتوى فقط."),
  session_exists: tr("توجد محاضرة جامعة بهذا الرقم في هذه المادة."),
  creator_only: tr("صاحب المحاضرة وحده يغيّر من يراها."),
  has_contributors: tr("لا يمكن جعلها خاصة: كتب فيها أعضاء آخرون."),
  media_not_allowed: tr("لا يمكن نشرها: فيها رابط لتسجيل أو ملف صوتي/مرئي. احذفه أولاً."),
  not_in_squad: tr("انضم إلى فرقة أولاً لتنسخ هذه المحاضرة."),
  own_squad_note: tr("هذه المحاضرة من فرقتك أصلاً."),
  cannot_endorse_own: tr("لا يمكنك توثيق محاضرتك."),
  admin_only_publish: tr("في هذه المجموعة ينشر المشرفون فقط."),
  invalid_visibility: tr("نوع المجموعة غير صالح."),
  invalid_publish_mode: tr("طريقة النشر غير صالحة."),
};
export const squadError = (r) =>
  r.offline ? tr("لا يوجد اتصال بالخادم.") : SQUAD_ERRORS[r.data?.error] || tr("حدث خطأ. أعد المحاولة.");

const ROLE_LABEL = () => ({ owner: tr("المنشئ"), admin: tr("مشرف"), editor: tr("محرّر"), viewer: tr("قارئ") });
/** Mirrors utils/law/permissions.js: the owner manages everyone, an admin only editors and viewers. */
const canManage = (mine, theirs) => {
  const me = mine === "contributor" ? "editor" : mine;
  const t = theirs === "contributor" ? "editor" : theirs;
  return me === "owner" ? t !== "owner" : me === "admin" ? t === "editor" || t === "viewer" : false;
};

const VIS = () => ({ private: tr("خاصة (بدعوة)"), public: tr("عامة") });
const MODE = () => ({ members_propose: tr("الأعضاء يقترحون تعديلات"), admin_only: tr("الأدمن فقط ينشر") });

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([k, v]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className="rounded-full px-3 py-1.5 text-sm font-semibold"
          style={value === k ? { background: "var(--law-primary)", color: "var(--law-on-primary)" } : { background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>{v}</button>
      ))}
    </div>
  );
}

function NoSquad({ onDone }) {
  const [f, setF] = useState({ name: "", moduleTitle: "", visibility: "private", publishMode: "members_propose" });
  const [code, setCode] = useState("");
  const [pub, setPub] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { Law.publicSquads(q.trim()).then((r) => r.ok && setPub(r.data.squads)); }, [q]);
  async function run(fn) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setMsg(squadError(r));
    onDone(r.data);
  }
  return (
    <>
      <Notice>{tr("مجموعة عمل: طلبة يتشاركون ملخصات ومذكرات ونوازل محلولة لمادة واحدة، وكل تعديل يمر عبر مراجعة. لا دردشة.")}</Notice>
      <Card className="mb-4 flex flex-col gap-3 p-4">
        <h2 className="font-bold">{tr("إنشاء مجموعة")}</h2>
        <Field label={tr("اسم المجموعة")}><Input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={tr("المادة")}><Input value={f.moduleTitle} maxLength={120} onChange={(e) => setF({ ...f, moduleTitle: e.target.value })} placeholder={tr("مثال: المسؤولية المدنية")} /></Field>
        <Segmented label={tr("نوع المجموعة")} value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} options={Object.entries(VIS())} />
        <Segmented label={tr("طريقة النشر")} value={f.publishMode} onChange={(v) => setF({ ...f, publishMode: v })} options={Object.entries(MODE())} />
        <Button type="button" disabled={busy || !f.name.trim()} onClick={() => run(() => Law.createSquad({ ...f, moduleTitle: f.moduleTitle.trim() || undefined }))}>{tr("إنشاء المجموعة")}</Button>
      </Card>
      <Card className="mb-4 flex flex-col gap-3 p-4">
        <h2 className="font-bold">{tr("انضم بدعوة")}</h2>
        <Field label={tr("رمز الدعوة (6 أحرف)")}><Input dir="ltr" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC234" /></Field>
        <Button type="button" variant="secondary" disabled={busy || code.replace(/\W/g, "").length !== 6} onClick={() => run(() => Law.joinSquad(code))}>{tr("انضمام")}</Button>
      </Card>
      <Card className="mb-4 flex flex-col gap-3 p-4">
        <h2 className="font-bold">{tr("المجموعات العامة")}</h2>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث باسم المجموعة أو المادة")} aria-label={tr("ابحث باسم المجموعة أو المادة")} />
        {pub.length === 0 ? <MascotSlot moment="empty" message={tr("لا مجموعات عامة بعد.")} /> : (
          <ul>{pub.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--law-border)" }}>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold"><bdi>{s.name}</bdi></span>
                <span className="block truncate text-xs" style={{ color: "var(--law-muted)" }}>{s.moduleTitle && <bdi>{s.moduleTitle} · </bdi>}<bdi dir="ltr">{s.memberCount}</bdi> {tr("أعضاء")}</span></span>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => Law.joinPublicSquad(s.id))}>{tr("انضمام")}</Button>
            </li>
          ))}</ul>
        )}
      </Card>
      {msg && <Notice tone="warn">{msg}</Notice>}
    </>
  );
}

function InviteCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
      className="flex items-center gap-2 rounded-xl px-3 py-2 font-bold tracking-[0.3em]" style={{ background: "var(--law-surface-2)" }} aria-label={tr("نسخ رمز الدعوة")}>
      <bdi dir="ltr">{code}</bdi>{copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

function Settings({ squad, onSaved, setError }) {
  const save = async (patch) => {
    const r = await Law.updateSquadSettings(patch);
    if (r.ok) onSaved(); else setError(squadError(r));
  };
  return (
    <Card className="mb-4 flex flex-col gap-3 p-4">
      <h2 className="font-bold">{tr("إعدادات المجموعة")}</h2>
      <Segmented label={tr("نوع المجموعة")} value={squad.visibility} onChange={(v) => save({ visibility: v })} options={Object.entries(VIS())} />
      <Segmented label={tr("طريقة النشر")} value={squad.publishMode} onChange={(v) => save({ publishMode: v })} options={Object.entries(MODE())} />
    </Card>
  );
}

/** Work groups: a few students, one module, shared documents only. Changes go through review. */
export default function Squad() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => Law.mySquad().then((r) => { if (r.ok) { setData(r.data); setError(null); } else setError(squadError(r)); });
  useEffect(() => { load(); }, []);

  async function leave() {
    if (!window.confirm(tr("مغادرة المجموعة؟"))) return;
    const r = await Law.leaveSquad();
    if (r.ok) load(); else setError(squadError(r));
  }
  async function changeRole(m, role) { const r = await Law.setSquadRole(m.userId, role); if (r.ok) load(); else setError(squadError(r)); }
  async function transfer(m) {
    if (!window.confirm(tr("نقل ملكية المجموعة إلى {0}؟ ستصبح مشرفاً.", [m.name]))) return;
    const r = await Law.transferSquad(m.userId);
    if (r.ok) load(); else setError(squadError(r));
  }
  async function kick(m) {
    if (!window.confirm(tr("إخراج {0} من المجموعة؟", [m.name]))) return;
    const r = await Law.removeSquadMember(m.userId);
    if (r.ok) load(); else setError(squadError(r));
  }

  const sq = data?.squad;
  const manager = data && ["owner", "admin"].includes(data.myRole);
  return (
    <>
      <CommunityTabs />
      <PageTitle sub={sq?.moduleTitle ? <bdi>{sq.moduleTitle}</bdi> : tr("ادرسوا معاً، وثائق مشتركة فقط")}>{sq?.name || tr("مجموعات العمل")}</PageTitle>
      {error && <Notice tone="warn">{error}</Notice>}
      {!data ? (!error && <p className="law-muted">…</p>) : !sq ? <NoSquad onDone={(d) => setData(d)} /> : (
        <>
          <Link to="/law/squad/docs" className="law-card mb-4 flex items-center gap-3 p-3 text-sm font-semibold">
            <Files size={20} style={{ color: "var(--law-accent)" }} />
            <span className="flex-1">{tr("وثائق المجموعة: ملخصات ومذكرات ونوازل محلولة")}</span>
            <span style={{ color: "var(--law-muted)" }}><Forward /></span>
          </Link>
          <Card className="mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold">
                <UsersThree size={22} style={{ color: "var(--law-primary)" }} />
                {tr("الأعضاء")} <bdi dir="ltr">{data.members.length}/{sq.maxMembers}</bdi>
                <span className="law-chip flex items-center gap-1">{sq.visibility === "public" ? <GlobeHemisphereWest size={14} /> : <Lock size={14} />}{VIS()[sq.visibility]}</span>
              </div>
              {sq.inviteCode && <InviteCode code={sq.inviteCode} />}
            </div>
            <p className="mb-2 text-sm" style={{ color: "var(--law-muted)" }}>{MODE()[sq.publishMode]}</p>
            <ul className="flex flex-col">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--law-border)" }}>
                  <Avatar person={m} size={36} />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    <bdi>{m.me ? tr("أنت") : m.name}</bdi>
                    {m.role === "owner" ? <span className="ms-2 text-xs" style={{ color: "var(--law-accent)" }}>{tr("المنشئ")}</span> : <span className="law-chip ms-2">{ROLE_LABEL()[m.role === "contributor" ? "editor" : m.role]}</span>}
                  </span>
                  {canManage(data.myRole, m.role) && !m.me && (
                    <select aria-label={tr("دور {0}", [m.name])} value={m.role === "contributor" ? "editor" : m.role} onChange={(e) => (e.target.value === "owner" ? transfer(m) : changeRole(m, e.target.value))} className="law-input w-auto">
                      {(data.myRole === "owner" ? ["admin", "editor", "viewer", "owner"] : ["editor", "viewer"]).map((r) => <option key={r} value={r}>{r === "owner" ? tr("نقل الملكية") : ROLE_LABEL()[r]}</option>)}
                    </select>
                  )}
                  {canManage(data.myRole, m.role) && !m.me && <button type="button" onClick={() => kick(m)} aria-label={tr("إخراج")} className="p-1" style={{ color: "var(--law-muted)" }}><X size={14} /></button>}
                </li>
              ))}
            </ul>
          </Card>
          {manager && <Settings squad={sq} onSaved={load} setError={setError} />}
          <Button type="button" variant="danger" onClick={leave} className="flex items-center gap-2 self-start"><SignOut size={18} /> {tr("مغادرة المجموعة")}</Button>
        </>
      )}
    </>
  );
}
