import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Back } from "@/components/LawOS/kit/DirArrow";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { loadGraph, startPathAutoSync, onPathQueueChange } from "@/components/LawOS/lib/pathSync";
import useModuleTree from "@/components/LawOS/module/useModuleTree";
import ModuleSetupWizard from "@/components/LawOS/module/ModuleSetupWizard";
import LinkedArticles from "@/components/LawOS/module/LinkedArticles";
import NodeSheet from "@/components/LawOS/module/NodeSheet";
import EmptyTree from "@/components/LawOS/module/EmptyTree";
import TrailView from "@/components/LawOS/module/views/TrailView";
import ReaderView from "@/components/LawOS/module/views/ReaderView";
import TalibWorkspace from "@/components/LawOS/module/TalibWorkspace";
import AddContentSheet from "@/components/LawOS/module/AddContentSheet";
import GraphAngleView from "@/components/LawOS/module/views/GraphAngleView";
import AxesView from "@/components/LawOS/module/views/AxesView";
import { tr } from "@/components/LawOS/lib/i18n";

// Alternative perspectives to view the same notes.
const OTHER_VIEWS = () => [
  ["trail", tr("مسار المراحل")],
  ["graph", tr("غراف العلاقات")],
  ["reader", tr("قارئ أكاديمي")],
  ["axes", tr("محاور المطبوع")],
];

/** A module's workspace: focused learning space, session rail, full tree, and bottom chat. */
export default function ModulePath() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [g, setG] = useState(null);
  const [stale, setStale] = useState(false);
  const [profile, setProfile] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [alt, setAlt] = useState(null); // null = the workspace
  const [adding, setAdding] = useState(false); // «+ إضافة محتوى أو حصة»
  const [open, setOpen] = useState(null);
  const [recapKey, setRecapKey] = useState(0);
  const tree = useModuleTree(id);

  const loadG = useCallback(async () => {
    const r = await loadGraph(id);
    setG(r.data);
    setStale(r.stale);
  }, [id]);

  useEffect(() => { loadG(); }, [loadG]);
  useEffect(() => {
    startPathAutoSync();
    return onPathQueueChange(() => loadG());
  }, [loadG]);

  useEffect(() => {
    Law.moduleProfile(id).then((r) => {
      setProfileReady(true);
      if (!r.ok) return;
      setProfile(r.data.profile);
      if (!r.data.profile.setupDone) setWizard(true);
    });
  }, [id]);

  const bump = useCallback(() => setRecapKey((k) => k + 1), []);

  async function confirmList() {
    const r = await Law.moduleEdit(id, { confirm: true });
    if (r.ok) setG((cur) => ({ ...cur, module: { ...cur.module, verified: true } }));
  }

  async function rename() {
    const t = window.prompt(tr("اسم المادة"), g.module.title);
    if (!t || t.trim() === g.module.title) return;
    const r = await Law.moduleEdit(id, { title: t });
    if (r.ok) setG((cur) => ({ ...cur, module: { ...cur.module, title: r.data.module.title } }));
  }

  async function remove() {
    if (!window.confirm(tr("حذف هذه المادة وكل ما فيها؟ لا يمكن التراجع."))) return;
    const r = await Law.moduleDelete(id);
    if (r.ok) navigate("/law/path", { replace: true });
  }

  if (!g) return <Notice tone="warn">{stale ? tr("يحتاج اتصالا بالخادم.") : "…"}</Notice>;
  const m = g.module;
  const nodes = tree.nodes || [];
  const openNode = (n) => setOpen(n);

  return (
    <>
      <PageTitle sub={<bdi>{m.semester}</bdi>}><bdi>{m.title}</bdi></PageTitle>
      <Link to="/law/path" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--law-primary)" }}>
        <Back /> <span>{tr("المسار الدراسي")}</span>
      </Link>
      {stale && <Notice tone="warn">{tr("بدون اتصال: يظهر آخر مسار محفوظ.")}</Notice>}
      {m.owned && !m.verified && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
          <span className="text-sm font-semibold">{tr("قائمة افتراضية — تحقق منها")}</span>
          <Button3D variant="neutral" onClick={confirmList}>{tr("هذه المادة صحيحة")}</Button3D>
        </div>
      )}

      {/* Clean secondary toolbar: alternative views and module management */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={tr("عروض أخرى")} className="flex flex-wrap items-center gap-2 text-xs">
          <Chip active={alt === null} onClick={() => setAlt(null)}>{tr("فضاء المادة")}</Chip>
          <span style={{ color: "var(--law-muted)" }}>{tr("عروض أخرى:")}</span>
          {OTHER_VIEWS().map(([k, label]) => (
            <Chip key={k} active={alt === k} onClick={() => setAlt(k)}>{label}</Chip>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button3D variant="neutral" onClick={() => setWizard(true)}>{tr("إعداد المادة")}</Button3D>
          {m.owned && <Button3D variant="neutral" onClick={rename}>{tr("تغيير الاسم")}</Button3D>}
          {m.owned && <Button3D variant="danger" onClick={remove}>{tr("حذف")}</Button3D>}
        </div>
      </div>

      {alt === null && (
        <>
          {tree.error && (
            <Notice tone="warn">
              {tree.error === "offline"
                ? tr("يحتاج هذا العرض اتصالا بالخادم. مسار المراحل متاح بدون اتصال.")
                : tr("تعذر تحميل الملاحظات.")}
            </Notice>
          )}
          {tree.nodes && nodes.length === 0 && (
            <EmptyTree tree={tree} onMentor={() => setAdding(true)} />
          )}
          {nodes.length > 0 && (
            <TalibWorkspace
              moduleId={id}
              nodes={nodes}
              profile={profile}
              tree={tree}
              onOpen={openNode}
              onAdd={() => setAdding(true)}
              onChanged={bump}
            />
          )}
        </>
      )}

      {alt === "trail" && <TrailView id={id} g={g} stale={stale} load={loadG} onMethod={() => setAlt(null)} />}
      {alt === "graph" && nodes.length > 0 && <GraphAngleView nodes={nodes} />}
      {alt === "reader" && nodes.length > 0 && <ReaderView nodes={nodes} onOpen={openNode} />}
      {alt === "axes" && nodes.length > 0 && <AxesView nodes={nodes} onOpen={openNode} />}

      <LinkedArticles moduleId={id} />

      <AddContentSheet
        open={adding}
        onClose={() => setAdding(false)}
        moduleId={id}
        tree={tree}
        onChanged={bump}
      />
      <NodeSheet
        node={open && nodes.find((n) => n.id === open.id)}
        tree={{
          ...tree,
          edit: async (...a) => {
            const r = await tree.edit(...a);
            bump();
            return r;
          },
        }}
        onClose={() => setOpen(null)}
      />
      <ModuleSetupWizard
        moduleId={id}
        initial={profile}
        open={wizard && profileReady}
        onClose={() => setWizard(false)}
        onSaved={(p) => {
          setProfile(p);
          setWizard(false);
        }}
      />
    </>
  );
}
