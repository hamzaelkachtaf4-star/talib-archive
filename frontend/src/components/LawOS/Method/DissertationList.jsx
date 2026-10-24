import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Input } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

export default function DissertationList() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [topic, setTopic] = useState("");
  useEffect(() => {
    Law.dissertations().then((r) => r.ok && setList(r.data.dissertations));
  }, []);
  async function create() {
    const r = await Law.createDissertation({ topic });
    if (r.ok) navigate(`/law/method/dissertation/${r.data.dissertation.id}`);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={tr("موضوع جديد")}
        />
        <Button
          onClick={create}
          disabled={!topic.trim()}
          aria-label={tr("إنشاء")}
        >
          <Plus size={20} weight="bold" />
        </Button>
      </div>
      {!list.length && (
        <EmptyState title={tr("لا مواضيع بعد")}>
          {tr(
            "ابنِ المقدمة في ست خطوات وتصميما ثنائيا، ثم اطلب الفحص والتصحيح."
          )}
        </EmptyState>
      )}
      {list.map((d) => (
        <Card key={d.id} className="p-0">
          <button
            type="button"
            onClick={() => navigate(`/law/method/dissertation/${d.id}`)}
            className="w-full p-3 text-start"
          >
            <span className="block font-bold">{d.topic}</span>
            <span className="law-muted text-xs">
              {d.status === "critiqued" ? tr("مُصحّح") : tr("مسودة")}
            </span>
          </button>
        </Card>
      ))}
    </div>
  );
}
