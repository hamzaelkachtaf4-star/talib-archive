import { useEffect, useState } from "react";
import Sheet from "@/components/LawOS/kit/Sheet";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Field, Input, Textarea, Select } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const KINDS = () => [["lecture", tr("محاضرة")], ["section", tr("محور")], ["point", tr("نقطة")]];

/** Edit one node of the content tree, add a child under it, or delete it with its subtree. */
export default function NodeSheet({ node, tree, onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("section");
  const [child, setChild] = useState("");
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    setTitle(node?.title || ""); setBody(node?.body || ""); setKind(node?.kind || "section"); setChild(""); setMsg(null);
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  async function save() {
    const r = await tree.edit(node.id, { title, body, kind });
    if (!r.ok) return setMsg(tr("تعذر الحفظ."));
    onClose();
  }
  async function addChild() {
    if (!child.trim()) return;
    const r = await tree.add({ parentId: node.id, title: child });
    if (!r.ok) return setMsg(r.data?.error?.code === "too_deep" ? tr("وصلت إلى أقصى عمق للمحاور.") : tr("تعذر الحفظ."));
    setChild("");
  }
  async function del() {
    if (!window.confirm(tr("حذف هذه العقدة وكل ما تحتها؟"))) return;
    const r = await tree.remove(node.id);
    if (r.ok) onClose(); else setMsg(tr("تعذر الحذف."));
  }
  return (
    <Sheet open onClose={onClose} title={node.title}>
      <div className="grid gap-3">
        {node.aiDraft && <Notice tone="muted">{tr("صيغ هذا النص بالذكاء الاصطناعي من مصادرك، وقد قبلتَه. راجعه قبل الاعتماد عليه.")}</Notice>}
        {msg && <Notice tone="warn">{msg}</Notice>}
        <Field label={tr("العنوان")}><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} dir="auto" /></Field>
        <Field label={tr("النوع")}><Select value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS()} /></Field>
        <Field label={tr("النص")}><Textarea value={body} rows={8} maxLength={20000} onChange={(e) => setBody(e.target.value)} dir="auto" /></Field>
        <div className="flex flex-wrap gap-2">
          <Button3D onClick={save}>{tr("حفظ")}</Button3D>
          <Button3D variant="danger" onClick={del}>{tr("حذف")}</Button3D>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addChild(); }}>
          <Input value={child} maxLength={200} onChange={(e) => setChild(e.target.value)} placeholder={tr("إضافة فرع تحت هذه العقدة")} aria-label={tr("إضافة فرع تحت هذه العقدة")} dir="auto" />
          <Button3D type="submit" variant="neutral">{tr("إضافة")}</Button3D>
        </form>
      </div>
    </Sheet>
  );
}
