import { PageTitle } from "@/components/LawOS/EmptyState";
import Card3D from "@/components/LawOS/kit/Card3D";
import { Link } from "react-router-dom";
import { tr } from "@/components/LawOS/lib/i18n";

/** Landing grid for a hub whose content lives on sub-routes. items: [{ to, title, hint, Icon }] */
export function HubGrid({ title, items }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(({ to, title: t, hint, Icon }) => (
          <Link key={to} to={to} className="no-underline">
            <Card3D interactive className="flex items-start gap-3">
              <Icon size={28} weight="fill" style={{ color: "var(--law-primary)", flex: "none" }} />
              <span className="grid gap-1 text-start">
                <span className="text-base font-bold">{t}</span>
                <span className="text-sm" style={{ color: "var(--law-muted)" }}>{hint}</span>
              </span>
            </Card3D>
          </Link>
        ))}
      </div>
    </>
  );
}
export { tr };
