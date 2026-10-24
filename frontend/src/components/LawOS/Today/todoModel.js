// Pure to-do logic for the Today dashboard (no IndexedDB, no network): ids, auto-generated items, filters, ordering
// and the merge of a server answer into the local list. Stored todos are the source of truth; auto items
// (today's lectures, due review cards) are computed and only become stored rows once the student edits or checks them.

export const MAX_TITLE = 300;

export function newClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-8${h().slice(1)}-${h()}${h()}${h()}`;
}

export const PRIORITIES = ["high", "medium", "normal"];
export const nextPriority = (p) => PRIORITIES[(PRIORITIES.indexOf(p) + 1) % PRIORITIES.length] || "normal";

export function makeTodo(title, { dueDate = null, kind = "custom", refType = null, refId = null, priority = "normal", clientId, sortOrder = 0, now = new Date() } = {}) {
  return {
    clientId: clientId || newClientId(), title: String(title).trim().slice(0, MAX_TITLE), kind, refType, refId, dueDate, priority: PRIORITIES.includes(priority) ? priority : "normal",
    done: false, doneAt: null, sortOrder, deletedAt: null, updatedAt: now.toISOString(), dirty: true,
  };
}

/** Today's lectures and the due-card review as computed todos. Ids are deterministic so every device agrees. */
export function autoItems({ date, slots = [], dueCards = 0, exams = [], dismissed = [], labels }) {
  const out = [];
  (slots || []).forEach((s, i) => {
    const key = String(s.startTime || i).replace(":", "");
    out.push({
      clientId: `auto-lecture-${date}-${key}`, title: labels.lecture(s), kind: "lecture", refType: "session", refId: null,
      dueDate: date, done: false, doneAt: null, sortOrder: -2000 + i, deletedAt: null, updatedAt: null, dirty: false, auto: true,
    });
  });
  if (dueCards > 0)
    out.push({
      clientId: `auto-review-${date}`, title: labels.review(dueCards), kind: "review", refType: "deck", refId: null,
      dueDate: date, done: false, doneAt: null, sortOrder: -1000, deletedAt: null, updatedAt: null, dirty: false, auto: true,
    });
  // exams within the next 7 days (confirmed dates only; the caller passes what the exam center holds)
  (exams || []).forEach((e) => {
    const d = e.daysTo ?? e.daysToExam;
    if (!Number.isInteger(d) || d < 0 || d > 7) return;
    out.push({
      clientId: `auto-exam-${e.id ?? e.date ?? out.length}-${date}`, title: labels.exam(e, d), kind: "review", refType: "module", refId: null,
      dueDate: date, done: false, doneAt: null, sortOrder: -3000, deletedAt: null, updatedAt: null, dirty: false, auto: true, priority: d <= 2 ? "high" : "medium",
    });
  });
  return out.filter((t) => !dismissed.includes(t.clientId));
}

/** Stored todos win over computed ones with the same id (a checked auto item stays checked, an edited one keeps its title). */
export function withAuto(stored, auto) {
  const have = new Set(stored.map((t) => t.clientId));
  return [...stored.filter((t) => !t.deletedAt), ...auto.filter((a) => !have.has(a.clientId))];
}

export const FILTERS = ["today", "late", "all"];

/** today: due today, undated, or done today; late: past due and not done; all: everything. */
export function filterTodos(list, filter, today) {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder || String(a.clientId).localeCompare(String(b.clientId)));
  if (filter === "all") return sorted;
  if (filter === "late") return sorted.filter((t) => !t.done && t.dueDate && t.dueDate < today);
  return sorted.filter((t) => !t.dueDate || t.dueDate === today);
}

export const lateCount = (list, today) => list.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;

/** True when every todo that is due today (and at least one exists) is done. */
export function allDoneToday(list, today) {
  const todays = list.filter((t) => !t.dueDate || t.dueDate === today);
  return todays.length > 0 && todays.every((t) => t.done);
}

/** Moves one item and renumbers sortOrder for the list so the order survives sync. Returns only the items that changed. */
export function reorder(list, from, to, now = new Date()) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const changed = [];
  next.forEach((t, i) => {
    if (t.sortOrder !== i) changed.push({ ...t, sortOrder: i, updatedAt: now.toISOString(), dirty: true });
  });
  return changed;
}

/**
 * Merges the server list into the local one. `pushed` maps clientId -> the updatedAt that was sent.
 *  - a local row edited after the push began (dirty and its updatedAt differs from what was sent) stays as it is;
 *  - otherwise the server's version wins and the row is clean (the server already applied last-write-wins);
 *  - rows only the server has are added; dirty rows the server does not know yet are kept for the next push;
 *  - `rejected` ids (the server refused them for good) are dropped instead of being re-sent forever.
 */
export function applyServer(local, server, pushed = new Map(), rejected = new Set()) {
  const byId = new Map(local.map((t) => [t.clientId, t]));
  const out = new Map();
  for (const s of server) {
    const l = byId.get(s.clientId);
    const editedSincePush = l && l.dirty && pushed.get(l.clientId) !== l.updatedAt;
    out.set(s.clientId, editedSincePush ? l : { ...s, dirty: false });
  }
  for (const l of local) {
    if (out.has(l.clientId)) continue;
    if (l.dirty && !rejected.has(l.clientId)) out.set(l.clientId, l);
  }
  return [...out.values()];
}
