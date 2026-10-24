import { useState } from "react";
import Law from "@/models/law";
import { Button, Textarea, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

function serialize(tree, depth = 0) {
  return (tree || [])
    .map(
      (n) =>
        `${"  ".repeat(depth)}${n.title}\n${serialize(n.children, depth + 1)}`
    )
    .join("");
}

function parse(text) {
  const root = { children: [] };
  const stack = [{ level: -1, node: root }];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const level = Math.floor(
      raw.match(/^[\t ]*/)[0].replace(/\t/g, "  ").length / 2
    );
    const node = { title: raw.trim().replace(/^[-•*]\s*/, ""), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= level)
      stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level, node });
  }
  return root.children;
}

/** The professor's plan as indented text (two spaces per level). It orders Exam Mode. */
export default function CoursePlanEditor({ subject, onSaved }) {
  const [text, setText] = useState(serialize(subject.coursePlan));
  const [msg, setMsg] = useState(null);
  async function save() {
    const r = await Law.updateSubject(subject.id, { coursePlan: parse(text) });
    setMsg(
      r.ok
        ? { tone: "ok", text: tr("حُفظ التصميم.") }
        : { tone: "warn", text: r.data?.error || tr("تعذر الحفظ") }
    );
    if (r.ok) onSaved?.(r.data.subject);
  }
  return (
    <div className="flex flex-col gap-3">
      <Notice>
        {tr(
          "اكتب تصميم الأستاذ كما في المحاضرة: كل عنوان في سطر، ومسافتان قبل العنوان الفرعي."
        )}
      </Notice>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ minHeight: "18rem", fontFamily: "inherit" }}
        placeholder={tr(
          "المبحث الأول: … المطلب الأول: … المطلب الثاني: … المبحث الثاني: …"
        )}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button onClick={save} className="self-start">
        {tr("حفظ التصميم")}
      </Button>
    </div>
  );
}
