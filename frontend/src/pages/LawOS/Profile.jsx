import AvatarArt from "@/components/LawOS/avatar/AvatarArt";
import { setMyAvatar } from "@/components/LawOS/lib/myAvatar";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import AvatarBuilder from "@/components/LawOS/avatar/AvatarBuilder";
import Sheet from "@/components/LawOS/kit/Sheet";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarCheck,
  Copy,
  ShareNetwork,
  Check,
  UsersThree,
  TreeStructure,
  Heart,
  Flame,
  ShieldCheck,
  Plus,
  BookBookmark,
  Users,
  GearSix,
  Sparkle,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Input, Notice } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { ScanQrButton } from "@/components/LawOS/qr/QrScanner";
import Referrals from "@/components/LawOS/Profile/Referrals";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";

const FRIEND_ERRORS = {
  invalid_friend_code: tr("لا يوجد طالب بهذا الرمز."),
  cannot_add_self: tr("هذا رمزك أنت."),
  too_many_attempts: tr("محاولات كثيرة. انتظر بضع دقائق."),
};

const num = (n) => <bdi dir="ltr">{Number(n || 0).toLocaleString("en")}</bdi>;

function FriendCode({ code }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/law/profile?add=${encodeURIComponent(code)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  async function share() {
    const text = tr("ادرس معي على {0}! رمز صديقي: {1}", [brandName(lang()), code]);
    if (navigator.share) {
      try {
        await navigator.share({ title: brandName(lang()), text, url: link });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl p-3 border border-[var(--law-border)] bg-[var(--law-surface-2)]">
      <div className="min-w-0">
        <p className="text-xs text-[var(--law-muted)]">
          {tr("رمز الصديق")}
        </p>
        <bdi dir="ltr" className="block truncate text-base font-bold tracking-wide sm:text-lg text-[var(--law-text)]">
          {code}
        </bdi>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="law-btn3d text-xs font-bold" data-variant="neutral" aria-label={tr("نسخ")}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <button type="button" onClick={share} className="law-btn3d text-xs font-bold" data-variant="accent" aria-label={tr("مشاركة")}>
          <ShareNetwork size={18} />
        </button>
      </div>
    </div>
  );
}

function Friends({ initialCode }) {
  const [data, setData] = useState(null);
  const [code, setCode] = useState(initialCode || "");
  const [msg, setMsg] = useState(null);
  const load = () => Law.friends().then((r) => r.ok && setData(r.data));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setMsg(null);
    const r = await Law.addFriend(code.trim());
    if (!r.ok)
      return setMsg({ tone: "warn", text: FRIEND_ERRORS[r.data?.error] || tr("حدث خطأ. أعد المحاولة.") });
    setCode("");
    setMsg({
      tone: "ok",
      text: r.data.status === "accepted" ? tr("أصبحتما صديقين في الدراسة!") : tr("أُرسل الطلب. ينتظر الموافقة."),
    });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex gap-2">
        <Input
          dir="ltr"
          placeholder="QAN-NOM-1234"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={24}
          aria-label={tr("رمز صديق")}
        />
        <Button type="submit" disabled={code.trim().length < 6}>
          {tr("إضافة")}
        </Button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

function PublicProfileToggle({ userId, initial }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState(null);
  async function toggle(e) {
    const next = e.target.checked;
    const r = await Law.setPublicProfile(next);
    if (!r.ok) return setError(r.data?.error === "consent_required" ? tr("وافق على الإشعار القانوني أولاً (أعد تحميل الصفحة).") : tr("حدث خطأ. أعد المحاولة."));
    setError(null);
    setOn(next);
  }
  return (
    <div className="mb-4 rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] p-5 shadow-xs">
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span>
          <span className="block text-sm font-bold text-[var(--law-text)]">{tr("ملف عام في منصة الكلية")}</span>
          <span className="block text-xs leading-6 text-[var(--law-muted)]">
            {tr("يرى الطلبة اسمك ومستواك وشاراتك وملخصاتك العامة. بريدك لا يظهر أبداً.")}
          </span>
        </span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-emerald-600 rounded" checked={on} onChange={toggle} />
      </label>
      {userId && (
        <Link to={`/law/u/${userId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
          {tr("معاينة ملفي العام")} <Forward />
        </Link>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

export default function Profile() {
  const user = useLawUser();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("works"); // "works" | "contributions" | "groups"
  const [worksFilter, setWorksFilter] = useState("latest"); // "latest" | "popular"
  const [notes, setNotes] = useState([]);
  const [friendCount, setFriendCount] = useState(0);
  const [squad, setSquad] = useState(null);
  const [projectCount, setProjectCount] = useState(0);

  useEffect(() => {
    Law.profile().then(setData);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    Law.studentProfile(user.id).then((r) => r.ok && setNotes(r.data?.profile?.notes || []));
  }, [user?.id]);
  useEffect(() => {
    Law.friends().then((r) => r.ok && setFriendCount((r.data?.friends || []).length));
    Law.mySquad().then((r) => r.ok && setSquad(r.data?.squad || null));
    Law.squadWorkspaces().then((r) => r.ok && setProjectCount((r.data?.workspaces || []).length));
  }, []);
  const sortedNotes = [...notes].sort((a, b) => worksFilter === "popular" ? (b.endorsementCount || 0) - (a.endorsementCount || 0) : new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const [me, setMe] = useState(null);
  const [editAvatar, setEditAvatar] = useState(false);
  useEffect(() => {
    Law.myProfile().then((r) => r.ok && setMe(r.data.profile));
  }, []);

  const [avatarErr, setAvatarErr] = useState(null);
  const saveAvatar = async (cfg) => {
    const r = await Law.updateMyProfile({ avatarConfig: cfg });
    if (!r.ok) return setAvatarErr(r.offline ? tr("لا يوجد اتصال بالخادم.") : tr("تعذر حفظ الصورة الرمزية. أعد المحاولة."));
    setAvatarErr(null);
    setMyAvatar(cfg);
    setMe(r.data.profile);
    setEditAvatar(false);
  };

  const p = data?.data?.progress;

  // Retrieve google auth info if available
  let googleAuth = null;
  try {
    const raw = localStorage.getItem("talib.auth.v1");
    if (raw) googleAuth = JSON.parse(raw);
  } catch {}

  const displayName = googleAuth?.name || user?.fullName || tr("طالب القانون");
  const displayEmail = googleAuth?.email || user?.email || "";

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      <Sheet open={editAvatar} onClose={() => setEditAvatar(false)} title={tr("الصورة الرمزية")}>
        <AvatarBuilder value={me?.avatarConfig} onSave={saveAvatar} onCancel={() => { setAvatarErr(null); setEditAvatar(false); }} error={avatarErr} />
      </Sheet>

      {/* Profile Header Card */}
      <div className="rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar with Level Badge */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEditAvatar(true)}
              aria-label={tr("تعديل الصورة الرمزية")}
              className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-emerald-600 shadow-sm bg-emerald-50 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
            >
              {googleAuth?.avatar ? (
                <img src={googleAuth.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <AvatarArt config={me?.avatarConfig} size={88} title={displayName} />
              )}
            </button>
            <span className="absolute -bottom-2 -end-2 bg-amber-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full border-2 border-white shadow-xs flex items-center gap-1">
              <span>{tr("المستوى")} <bdi dir="ltr">{p?.level?.level ?? 1}</bdi></span>
              <Flame size={12} weight="fill" />
            </span>
          </div>

          {/* User Info & Badges */}
          <div className="flex-1 text-center sm:text-start min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
              <h1 className="text-xl font-extrabold text-[var(--law-text)] truncate">
                <bdi>{displayName}</bdi>
              </h1>
              {googleAuth?.provider === "google" ? (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="font-extrabold">G</span>
                  <span>Google · <bdi dir="ltr">{displayEmail}</bdi></span>
                </span>
              ) : displayEmail ? (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck size={14} weight="bold" />
                  <span><bdi dir="ltr">{displayEmail}</bdi></span>
                </span>
              ) : null}
            </div>

            <p className="text-xs text-[var(--law-muted)] font-medium mb-4">
              {[me?.filiere, me?.semester, me?.faculty].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}<bdi>{x}</bdi></span>)}
            </p>

            {/* 4 Academic Counters */}
            <div className="grid grid-cols-4 gap-2 max-w-md mx-auto sm:mx-0">
              <div className="bg-[var(--law-surface-2)] border border-[var(--law-border)] rounded-2xl p-2.5 text-center">
                <p className="text-[11px] text-[var(--law-muted)] font-bold">{tr("المشاريع")}</p>
                <p className="text-base font-extrabold text-[var(--law-text)]">{num(projectCount)}</p>
              </div>
              <div className="bg-[var(--law-surface-2)] border border-[var(--law-border)] rounded-2xl p-2.5 text-center">
                <p className="text-[11px] text-[var(--law-muted)] font-bold">{tr("التلاخيص")}</p>
                <p className="text-base font-extrabold text-[var(--law-text)]">{num(notes.length)}</p>
              </div>
              <div className="bg-[var(--law-surface-2)] border border-[var(--law-border)] rounded-2xl p-2.5 text-center">
                <p className="text-[11px] text-[var(--law-muted)] font-bold">{tr("المجموعات")}</p>
                <p className="text-base font-extrabold text-[var(--law-text)]">{num(squad ? 1 : 0)}</p>
              </div>
              <div className="bg-[var(--law-surface-2)] border border-[var(--law-border)] rounded-2xl p-2.5 text-center">
                <p className="text-[11px] text-[var(--law-muted)] font-bold">{tr("الأصدقاء")}</p>
                <p className="text-base font-extrabold text-[var(--law-text)]">{num(friendCount)}</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex sm:flex-col gap-2 shrink-0">
            <Link to="/law/settings" className="law-btn3d text-xs font-bold" data-variant="neutral">
              <GearSix size={16} />
              {tr("تعديل الملف")}
            </Link>
            <button
              type="button"
              onClick={() => setEditAvatar(true)}
              className="law-btn3d text-xs font-bold"
              data-variant="accent"
            >
              <Sparkle size={16} weight="fill" />
              {tr("صمم شخصيتك")}
            </button>
          </div>
        </div>
      </div>

      {/* The 3 Interactive Profile Tabs */}
      <div className="rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] overflow-hidden shadow-xs">
        {/* Tab Navigation */}
        <div className="border-b border-[var(--law-border)] px-6 pt-4 flex gap-4 overflow-x-auto" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "works"}
            onClick={() => setActiveTab("works")}
            className={`pb-3 text-xs sm:text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "works"
                ? "text-emerald-700 border-emerald-700"
                : "text-[var(--law-muted)] border-transparent hover:text-[var(--law-text)]"
            }`}
          >
            <BookBookmark size={18} weight={activeTab === "works" ? "fill" : "regular"} />
            {tr("الأعمال والمشاريع")}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "contributions"}
            onClick={() => setActiveTab("contributions")}
            className={`pb-3 text-xs sm:text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "contributions"
                ? "text-emerald-700 border-emerald-700"
                : "text-[var(--law-muted)] border-transparent hover:text-[var(--law-text)]"
            }`}
          >
            <TreeStructure size={18} weight={activeTab === "contributions" ? "fill" : "regular"} />
            {tr("المساهمات والملخصات")}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "groups"}
            onClick={() => setActiveTab("groups")}
            className={`pb-3 text-xs sm:text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "groups"
                ? "text-emerald-700 border-emerald-700"
                : "text-[var(--law-muted)] border-transparent hover:text-[var(--law-text)]"
            }`}
          >
            <Users size={18} weight={activeTab === "groups" ? "fill" : "regular"} />
            {tr("مجموعاتي ولقاءات المراجعة")}
          </button>
        </div>

        {/* Tab 1: الأعمال والمشاريع */}
        {activeTab === "works" && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--law-muted)]">
                {tr("عرض كافة الأعمال والمشاريع المنجزة")}
              </span>
              <div className="flex items-center gap-1 bg-[var(--law-surface-2)] p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setWorksFilter("latest")}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    worksFilter === "latest" ? "bg-[var(--law-surface)] shadow-xs text-[var(--law-accent)]" : "text-[var(--law-muted)] hover:text-[var(--law-text)]"
                  }`}
                >
                  {tr("الأحدث")}
                </button>
                <button
                  type="button"
                  onClick={() => setWorksFilter("popular")}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    worksFilter === "popular" ? "bg-[var(--law-surface)] shadow-xs text-[var(--law-accent)]" : "text-[var(--law-muted)] hover:text-[var(--law-text)]"
                  }`}
                >
                  {tr("الأكثر تفاعلاً")}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {!sortedNotes.length && <p className="rounded-2xl border border-dashed border-[var(--law-border)] p-6 text-center text-sm text-[var(--law-muted)]">{tr("لا أعمال منشورة بعد. انشر ملخصاً من فضاء فرقتك ليظهر هنا.")}</p>}
              {sortedNotes.map((n) => (
                <Link key={n.id} to={`/law/hub/notes/${n.id}`} className="rounded-2xl border border-[var(--law-border)] bg-[var(--law-surface)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs hover:border-[var(--law-muted)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><TreeStructure size={22} weight="duotone" /></div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-[var(--law-text)] text-sm truncate"><bdi>{n.title}</bdi></h2>
                      <p className="text-xs text-[var(--law-muted)] truncate"><bdi>{[n.moduleName, n.professorName].filter(Boolean).join(" · ")}</bdi></p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                    <span className="whitespace-nowrap bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1"><TreeStructure size={14} />{tr("ملخص")}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-rose-600 whitespace-nowrap"><Heart size={14} weight="fill" />{num(n.endorsementCount)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: المساهمات والملخصات */}
        {activeTab === "contributions" && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--law-muted)]">
                {tr("الملخصات والمذكرات التي شاركتها مع زملائك")}
              </span>
              <Link to="/law/community/hub" className="law-btn3d text-xs font-bold self-start sm:self-auto" data-variant="accent">
                <Plus size={16} weight="bold" />
                {tr("إضافة ملخص جديد")}
              </Link>
            </div>

            <div className="space-y-3">
              {!notes.length && <p className="rounded-2xl border border-dashed border-[var(--law-border)] p-6 text-center text-sm text-[var(--law-muted)]">{tr("لم تنشر أي ملخص بعد.")}</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-2xl border border-[var(--law-border)] bg-[var(--law-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="min-w-0">
                    <h2 className="font-bold text-[var(--law-text)] text-sm truncate"><bdi>{n.title}</bdi></h2>
                    <p className="text-xs text-[var(--law-muted)]"><bdi>{n.moduleName}</bdi></p>
                  </div>
                  <span className="self-start sm:self-auto bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                    <Check size={14} weight="bold" />
                    {n.verified ? tr("موثّق") : tr("مقبول ومنشور")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: مجموعاتي ولقاءات المراجعة */}
        {activeTab === "groups" && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--law-muted)]">
                {tr("مجموعات المذاكرة الميدانية والجلسات المباشرة")}
              </span>
              <Link to="/law/community/squads" className="law-btn3d text-xs font-bold self-start sm:self-auto" data-variant="neutral">
                <Plus size={16} weight="bold" />
                {tr("إنشاء فوج مراجعة")}
              </Link>
            </div>

            <div className="space-y-3">
              {squad ? (
                <Link to="/law/community/squads" className="rounded-2xl border border-[var(--law-border)] bg-[var(--law-surface)] p-4 flex items-center justify-between gap-3 shadow-xs">
                  <div className="min-w-0">
                    <h2 className="font-bold text-[var(--law-text)] text-sm truncate"><bdi>{squad.name}</bdi></h2>
                    <p className="text-xs text-[var(--law-muted)]"><bdi>{[squad.moduleTitle, squad.cohortTag].filter(Boolean).join(" · ")}</bdi></p>
                  </div>
                  <span className="text-[var(--law-muted)]"><Forward /></span>
                </Link>
              ) : (
                <p className="rounded-2xl border border-dashed border-[var(--law-border)] p-6 text-center text-sm text-[var(--law-muted)]">{tr("لا فوج بعد. أنشئ فوج مراجعة أو انضم برمز دعوة.")}</p>
              )}
              <p className="text-xs text-[var(--law-muted)]">{tr("لقاءات المراجعة المباشرة غير متاحة بعد.")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Squad Link */}
      <Link to="/law/community/squads" className="rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] flex items-center gap-4 p-5 shadow-xs hover:border-[var(--law-muted)] transition-colors">
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <UsersThree size={24} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="block font-bold text-[var(--law-text)] text-sm">{tr("فرقة الدراسة")}</span>
          <span className="block text-xs text-[var(--law-muted)]">
            {tr("المحاضرة الجامعة وبطاقات مشتركة، حتى 6 طلبة")}
          </span>
        </div>
        <span className="text-[var(--law-muted)]"><Forward /></span>
      </Link>

      <Referrals />

      <PublicProfileToggle userId={user?.id} initial={!!data?.data?.account?.publicProfile} key={String(!!data?.data?.account?.publicProfile)} />

      {/* Friends Card */}
      <div className="rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-[var(--law-text)]">{tr("أصدقاء الدراسة")}</h2>
        {p?.friendCode && <FriendCode code={p.friendCode} />}
        <div className="pt-2">
          <Friends initialCode={params.get("add") || ""} />
        </div>
      </div>

      {/* Linked Devices */}
      <div className="rounded-3xl border border-[var(--law-border)] bg-[var(--law-surface)] p-5 shadow-xs">
        <h2 className="mb-3 text-sm font-bold text-[var(--law-text)]">{tr("الأجهزة")}</h2>
        <ScanQrButton />
      </div>
    </div>
  );
}
