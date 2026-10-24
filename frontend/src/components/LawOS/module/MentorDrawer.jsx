import { useEffect, useState } from "react";
import { Brain, ChatCircleDots, ListChecks, Sparkle, X } from "@phosphor-icons/react";
import Sheet from "@/components/LawOS/kit/Sheet";
import ModuleMentorChat from "./ModuleMentorChat";
import MemoryPanel from "./MemoryPanel";
import { tr } from "@/components/LawOS/lib/i18n";

/**
 * «مساعد طالب»: a side drawer over the subject. Ask questions, ask for a summary of the open session or build the course plan
 * together, and see/edit what the assistant remembers about how you learn.
 */
export default function MentorDrawer({ open, onClose, moduleId, tree, onChanged, sessionTitle }) {
  const [tab, setTab] = useState("chat");
  const [seed, setSeed] = useState(null);
  useEffect(() => { if (!open) setSeed(null); }, [open]); // an old quick action must not refill the box next time
  const quick = (mode, question) => { setTab("chat"); setSeed({ mode, question, nonce: Date.now() }); };
  return (
    <Sheet open={open} onClose={onClose} variant="drawer" label={tr("مساعد طالب")}>
      <div className="grid gap-3" aria-label={tr("مساعد طالب")}>
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}><Sparkle size={20} weight="fill" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1 leading-5"><h2 className="text-lg font-bold">{tr("مساعد طالب")}</h2><p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("يقرأ ملاحظات هذه المادة ومصادرها فقط")}</p></div>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق")} className="flex h-9 w-9 items-center justify-center rounded-full"><X size={18} aria-hidden="true" /></button>
        </header>
        <div role="group" aria-label={tr("اقتراحات سريعة")} className="flex flex-wrap gap-2">
          <button type="button" className="law-chip" onClick={() => quick("qa", tr("لخّص لي الحصة «{0}» في نقاط موجزة.", [(sessionTitle || "").slice(0, 80)]))}><ListChecks size={14} aria-hidden="true" /> {tr("لخّص هذه الحصة")}</button>
          <button type="button" className="law-chip" onClick={() => quick("build", tr("ساعدني في بناء تصميم الدرس وخطته من مصادري."))}><Brain size={14} aria-hidden="true" /> {tr("ابنِ معي خطة الدرس")}</button>
        </div>
        <div role="group" aria-label={tr("أقسام المساعد")} className="flex gap-2">
          {[["chat", tr("المحادثة"), ChatCircleDots], ["memory", tr("ذاكرة المساعد"), Brain]].map(([k, l, Icon]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className="law-btn3d" data-variant={tab === k ? undefined : "neutral"}><Icon size={16} aria-hidden="true" />{l}</button>
          ))}
        </div>
        {tab === "chat" ? <ModuleMentorChat moduleId={moduleId} tree={tree} onChanged={onChanged} seed={seed} /> : <MemoryPanel moduleId={moduleId} />}
      </div>
    </Sheet>
  );
}
