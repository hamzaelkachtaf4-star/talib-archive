import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";
import { Button } from "@/components/LawOS/ui";
import { GROUP_LABEL, groupNotifications, whenFmt } from "./describe";

/**
 * The notification feed shared by the popover (limit 8) and the full page. Friend requests can be answered in place.
 * `onUnread(n)` reports the unread count after every change so the bell badge stays right.
 */
export default function NotificationList({ limit, onUnread, onNavigate }) {
  const [items, setItems] = useState(null);
  const [requests, setRequests] = useState([]); // pending follow requests (need the request id to answer)
  const [failed, setFailed] = useState(false);
  const [serverUnread, setServerUnread] = useState(0); // counts all unread, not only the 30 loaded
  const [readHere, setReadHere] = useState(0);
  const [answered, setAnswered] = useState(() => new Set()); // friend requests answered here (the buttons go away)

  const load = useCallback(async () => {
    const [n, r] = await Promise.all([Law.notifications(), Law.socialRequests()]);
    if (!n.ok) return setFailed(true);
    setFailed(false);
    setItems(n.data.items);
    setServerUnread(n.data.unread);
    setReadHere(0);
    setRequests(r.ok ? r.data.requests || [] : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Tell the bell how many are unread after every change (never from inside a state updater).
  useEffect(() => { if (items) onUnread?.(Math.max(0, serverUnread - readHere)); }, [items, serverUnread, readHere]); // eslint-disable-line react-hooks/exhaustive-deps

  const markOne = async (id) => {
    const r = await Law.readNotification(id);
    if (r.ok) {
      const was = items?.find((x) => x.id === id);
      if (was && !was.readAt) setReadHere((n) => n + 1);
      setItems((cur) => cur.map((x) => (x.id === id ? { ...x, readAt: x.readAt || new Date().toISOString() } : x)));
    }
  };
  const markAll = async () => {
    const r = await Law.readAllNotifications();
    if (r.ok) {
      setReadHere(serverUnread);
      setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    }
  };
  const decideFriend = async (n, accept) => {
    const r = await Law.respondFriend(n.payload?.friendshipId, accept);
    // not_found: it was answered elsewhere already; the buttons go away either way
    if (r.ok || r.data?.error === "not_found" || r.status === 404) { setAnswered((s) => new Set(s).add(n.id)); await markOne(n.id); }
  };
  const decide = async (n, accept) => {
    const req = requests.find((q) => q.from?.userId === n.payload?.userId);
    if (!req) return;
    const r = await Law.socialDecide(req.id, accept);
    if (r.ok) { setRequests((cur) => cur.filter((q) => q.id !== req.id)); await markOne(n.id); }
  };

  if (failed) return <p role="status" className="p-4 text-sm" style={{ color: "var(--law-muted)" }}>{tr("تعذّر تحميل الإشعارات.")}</p>;
  if (!items) return <p role="status" className="p-4 text-sm" style={{ color: "var(--law-muted)" }}>{tr("جارٍ التحميل…")}</p>;
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) return <p className="p-4 text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا إشعارات بعد.")}</p>;
  const labels = GROUP_LABEL();
  const unread = items.filter((x) => !x.readAt).length;

  return (
    <div>
      {unread > 0 && (
        <div className="flex justify-end p-2">
          <Button variant="secondary" onClick={markAll}>{tr("تعليم الكل كمقروء")}</Button>
        </div>
      )}
      {groupNotifications(shown).map(({ group, items: rows }) => (
        <section key={group} aria-label={labels[group]}>
          <h3 className="px-4 pt-3 text-xs font-bold" style={{ color: "var(--law-muted)" }}>{labels[group]}</h3>
          <ul>
            {rows.map((n) => {
              const pendingReq = n.type === "FOLLOW_REQUEST" && requests.some((q) => q.from?.userId === n.payload?.userId);
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--law-border)", background: n.readAt ? "transparent" : "var(--law-surface-2)" }}>
                  <div className="min-w-0 flex-1 text-start">
                    <Link to={n.view.to} onClick={() => { markOne(n.id); onNavigate?.(); }} className="block text-sm font-semibold">
                      <bdi>{n.view.text}</bdi>
                    </Link>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--law-muted)" }}>{whenFmt(n.createdAt)}</p>
                    {n.type === "FRIEND_REQUEST" && !answered.has(n.id) && (
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => decideFriend(n, true)}>{tr("قبول")}</Button>
                        <Button variant="secondary" onClick={() => decideFriend(n, false)}>{tr("رفض")}</Button>
                      </div>
                    )}
                    {!["FRIEND_REQUEST", "FOLLOW_REQUEST"].includes(n.type) && n.view.to && (
                      <Link to={n.view.to} onClick={() => { markOne(n.id); onNavigate?.(); }} className="mt-1 inline-block text-xs font-bold" style={{ color: "var(--law-primary)" }}>{tr("عرض")}</Link>
                    )}
                    {pendingReq && (
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => decide(n, true)}>{tr("قبول")}</Button>
                        <Button variant="secondary" onClick={() => decide(n, false)}>{tr("رفض")}</Button>
                      </div>
                    )}
                  </div>
                  {!n.readAt && (
                    <button type="button" onClick={() => markOne(n.id)} aria-label={tr("تعليم كمقروء")} className="shrink-0 p-1 text-xs font-bold" style={{ color: "var(--law-primary)" }}>
                      {tr("مقروء")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
