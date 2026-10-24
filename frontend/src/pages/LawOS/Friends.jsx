import { useCallback, useEffect, useState } from "react";
import { ShareNetwork, UserPlus, Check, X, ProhibitInset, Copy } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import Avatar from "@/components/LawOS/kit/Avatar";
import AvatarArt from "@/components/LawOS/avatar/AvatarArt";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const REASON = (r) =>
  r.code === "same_group" ? tr("نفس الفوج") : r.code === "same_semester" ? tr("نفس الفصل") : r.code === "diligent" ? `${tr("مواظب")}: ${r.streak}` : r.code === "mutual_friends" ? tr("{0} أصدقاء مشتركين", [r.count]) : "";

function Person({ p, actions }) {
  return (
    <li className="law-card3d flex items-center gap-3">
      {p.avatarConfig ? <AvatarArt config={p.avatarConfig} size={44} /> : <Avatar name={p.name} size={44} />}
      <div className="min-w-0 flex-1 text-start">
        <p className="truncate font-semibold"><bdi>{p.name}</bdi> {p.isPrivate && <span className="law-chip">{tr("حساب خاص")}</span>}</p>
        {p.handle && <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">@{p.handle}</bdi></p>}
        {p.reasons?.length > 0 && <p className="mt-0.5 flex flex-wrap gap-1 text-xs">{p.reasons.map((r, i) => <span key={i} className="law-chip">{REASON(r)}</span>)}</p>}
      </div>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </li>
  );
}

function FollowButton({ p, onChange }) {
  const [s, setS] = useState(p.status || "none");
  const act = async () => {
    const r = s === "none" || s === "requested_by_them" ? await Law.socialFollow(p.userId) : await Law.socialUnfollow(p.userId);
    if (r.ok) { setS(r.data.status); onChange?.(); }
  };
  const label = { none: tr("متابعة"), requested_by_them: tr("متابعة"), pending: tr("بانتظار الموافقة"), following: tr("أتابعه"), friends: tr("صديق") }[s] || tr("متابعة");
  return <Button3D variant={s === "none" || s === "requested_by_them" ? "brand" : "neutral"} onClick={act}>{s === "none" ? <UserPlus size={16} /> : null} {label}</Button3D>;
}

export default function Friends() {
  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sugg, setSugg] = useState([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [cfg, setCfg] = useState({ contactMatch: false, hasPhone: false });
  const [matches, setMatches] = useState(null);
  const [me, setMe] = useState(null);
  const [code, setCode] = useState(null); // { shareCode, whatsappUrl }
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(false);
  const load = useCallback(() => {
    Law.socialFriends().then((r) => (r.ok ? setFriends(r.data.friends) : setOffline(true)));
    Law.socialRequests().then((r) => r.ok && setRequests(r.data.requests));
    Law.socialSuggestions().then((r) => r.ok && setSugg(r.data.suggestions));
    Law.socialConfig().then((r) => r.ok && setCfg(r.data));
    Law.profile().then((r) => r.ok && setMe(r.data.progress));
    Law.friendCode(tr("انضم إليّ على {0} برمز الصداقة:", [location.origin])).then((r) => r.ok && setCode(r.data));
  }, []);
  useEffect(load, [load]);

  const decide = async (id, accept) => { await Law.socialDecide(id, accept); load(); };
  const search = async (e) => { e.preventDefault(); const r = await Law.socialFind(q); setFound(r.ok ? r.data.results : []); };
  const share = () => {
    if (!code) return;
    const text = tr("انضم إليّ على التطبيق! رمز الصداقة: {0}", [code.shareCode]);
    if (navigator.share) navigator.share({ text, url: location.origin }).catch(() => {});
    else window.open(code.whatsappUrl, "_blank", "noopener");
  };
  const whatsapp = () => code && window.open(code.whatsappUrl, "_blank", "noopener");
  const copy = async () => {
    try { await navigator.clipboard.writeText(code.shareCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the code is on screen */ }
  };
  const pickContacts = async () => {
    try {
      const picked = await navigator.contacts.select(["tel"], { multiple: true });
      const numbers = picked.flatMap((c) => c.tel || []).slice(0, 500);
      const r = await Law.socialMatch(numbers);
      setMatches(r.ok ? r.data.matches : []);
    } catch { /* cancelled */ }
  };
  const canPick = cfg.contactMatch && typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  return (
    <>
      <CommunityTabs />
      <PageTitle sub={tr("ادرس مع زملائك وتبادلوا التشجيع")}>{tr("الأصدقاء")}</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {[["friends", tr("الأصدقاء"), friends.length], ["requests", tr("الطلبات"), requests.length], ["suggestions", tr("اقتراحات"), 0], ["find", tr("بحث"), 0]].map(([k, label, n]) => (
          <Chip key={k} role="tab" aria-selected={tab === k} active={tab === k} onClick={() => setTab(k)}>{label}{n > 0 && <bdi dir="ltr"> ({n})</bdi>}</Chip>
        ))}
      </div>
      {offline && <Notice tone="warn">{tr("بدون اتصال.")}</Notice>}
      {tab === "friends" && (friends.length ? <ul className="grid gap-2">{friends.map((p) => <Person key={p.userId} p={p} actions={<><FollowButton p={p} onChange={load} /><button type="button" aria-label={tr("حظر")} className="p-2" onClick={async () => { if (window.confirm(tr("حظر هذا المستخدم؟"))) { await Law.socialBlock(p.userId); load(); } }}><ProhibitInset size={18} /></button></>} />)}</ul> : <EmptyState title={tr("لا أصدقاء بعد")} hint={tr("ابحث عن زميل أو شارك رمزك.")} />)}
      {tab === "requests" && (requests.length ? <ul className="grid gap-2">{requests.map((r) => <Person key={r.id} p={r.from} actions={<><Button3D onClick={() => decide(r.id, true)}><Check size={16} /> {tr("قبول")}</Button3D><Button3D variant="neutral" onClick={() => decide(r.id, false)} aria-label={tr("رفض")}><X size={16} /></Button3D></>} />)}</ul> : <EmptyState title={tr("لا طلبات")} />)}
      {tab === "suggestions" && (sugg.length ? <ul className="grid gap-2">{sugg.map((p) => <Person key={p.userId} p={p} actions={<FollowButton p={{ ...p, status: "none" }} onChange={load} />} />)}</ul> : <EmptyState title={tr("لا اقتراحات الآن")} hint={tr("أكمل ملفك الدراسي لنقترح عليك زملاء من فوجك.")} />)}
      {tab === "find" && (
        <div className="grid gap-4">
          <form onSubmit={search} className="flex gap-2"><input className="law-input" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="@handle / XXXX-XXXX" aria-label={tr("بحث")} /><Button3D type="submit">{tr("بحث")}</Button3D></form>
          {found && (found.length ? <ul className="grid gap-2">{found.map((p) => <Person key={p.userId} p={p} actions={<FollowButton p={p} onChange={load} />} />)}</ul> : <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا نتائج.")}</p>)}
          {canPick && <div className="grid gap-2"><Button3D variant="neutral" onClick={pickContacts}>{tr("البحث في جهات الاتصال")}</Button3D>{matches && (matches.length ? <ul className="grid gap-2">{matches.map((p) => <Person key={p.userId} p={p} actions={<FollowButton p={p} onChange={load} />} />)}</ul> : <p className="text-sm">{tr("لا نتائج.")}</p>)}</div>}
          <div className="law-card3d grid gap-2">
            <p className="font-bold">{tr("ادعُ زملاءك")}</p>
            {code && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {tr("رمز الصداقة")}: <bdi dir="ltr" className="text-lg font-bold tracking-widest">{code.shareCode}</bdi>
                <button type="button" onClick={copy} className="law-chip" aria-label={tr("نسخ الرمز")}><Copy size={14} /> {copied ? tr("تم النسخ") : tr("نسخ")}</button>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button3D variant="neutral" onClick={whatsapp} disabled={!code}><ShareNetwork size={16} /> {tr("مشاركة عبر واتساب")}</Button3D>
              {typeof navigator !== "undefined" && navigator.share && <Button3D variant="neutral" onClick={share} disabled={!code}>{tr("مشاركة")}</Button3D>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
