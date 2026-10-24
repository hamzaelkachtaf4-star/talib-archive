import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import Chip from "@/components/LawOS/kit/Chip";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { tr } from "@/components/LawOS/lib/i18n";

export default function HubRequests() {
  const [role, setRole] = useState("owner");
  const [list, setList] = useState(null);
  useEffect(() => { setList(null); Law.hubCRs(role).then((r) => setList(r.ok ? r.data.changeRequests : [])); }, [role]);
  return (
    <>
      <PageTitle sub={tr("اقتراحات تعديل الملخصات")}>{tr("طلبات التعديل")}</PageTitle>
      <CommunityTabs />
      <div className="mb-4 flex gap-2"><Chip active={role === "owner"} onClick={() => setRole("owner")}>{tr("على ملخصاتي")}</Chip><Chip active={role === "author"} onClick={() => setRole("author")}>{tr("طلباتي")}</Chip></div>
      {list && !list.length && <EmptyState title={tr("لا طلبات مفتوحة")} />}
      <ul className="grid gap-2">
        {(list || []).map((c) => (
          <li key={c.id}><Link to={`/law/community/hub/requests/${c.id}`} className="law-card3d block text-start no-underline">
            <p className="font-bold"><bdi>{c.title}</bdi></p>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi>{c.noteTitle}</bdi> · <bdi>{c.author.name}</bdi>{c.status === "CONFLICT" && ` · ${tr("تعارض")}`}</p>
          </Link></li>
        ))}
      </ul>
    </>
  );
}
