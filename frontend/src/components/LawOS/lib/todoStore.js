import Law from "@/models/law";
import * as idb from "./idb";
import { applyServer, makeTodo, reorder as reorderList } from "../Today/todoModel";

// Offline-first to-do store: every write lands in IndexedDB first (`dirty: true`) and a sync pushes the dirty rows.
// Sync is serialised and best-effort: failing offline just leaves the rows dirty for the next attempt.
const STORE = "todos";
const listeners = new Set();
let syncing = null;
let again = false;

const emit = () => listeners.forEach((fn) => fn());
export const onTodosChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const strip = ({ dirty, auto, ...t }) => t;

export async function loadTodos() {
  return idb.getAll(STORE);
}

async function save(rows) {
  if (!rows.length) return;
  await idb.putMany(STORE, rows);
  emit();
  syncTodos(); // fire and forget; failures leave the rows dirty
}

export async function addTodo(title, opts) {
  const t = makeTodo(title, opts);
  if (!t.title) return null;
  await save([t]);
  return t;
}

/** Upserts a stored copy of a todo (used when the student acts on a computed one). */
export async function putTodo(t, patch = {}) {
  const next = { ...strip(t), ...patch, updatedAt: new Date().toISOString(), dirty: true };
  next.title = String(next.title).trim().slice(0, 300); // the server refuses longer titles; a computed title can be long
  next.doneAt = next.done ? (t.doneAt || next.updatedAt) : null;
  await save([next]);
  return next;
}

export const toggleTodo = (t) => putTodo(t, { done: !t.done });
export const editTodo = (t, title) => putTodo(t, { title: String(title).trim().slice(0, 300) || t.title });
export const removeTodo = (t) => putTodo(t, { deletedAt: new Date().toISOString() });

/** `list` is the visible stored list in display order. */
export async function moveTodo(list, from, to) {
  await save(reorderList(list, from, to));
}

export async function pendingTodos() {
  return (await loadTodos()).filter((t) => t.dirty).length;
}

const MAX_PASSES = 5; // a sync never loops forever, whatever the server answers

/** Pushes dirty rows (200 at a time) and merges the server's answer. Resolves true when the server was reached. */
export function syncTodos() {
  if (syncing) { again = true; return syncing; }
  syncing = (async () => {
    let reached = false;
    try {
      let passes = 0;
      do {
        again = false;
        passes++;
        const local = await loadTodos();
        const dirty = local.filter((t) => t.dirty).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).slice(0, 200);
        const r = await Law.syncTodos(dirty.map(strip));
        if (!r.ok) break;
        reached = true;
        const sent = new Map(dirty.map((t) => [t.clientId, t.updatedAt]));
        const rejected = new Set((r.data.rejected || []).filter((x) => !/^too_many/.test(x.reason)).map((x) => x.clientId).filter(Boolean));
        // Read, merge and write in one transaction: a todo added meanwhile (this tab or another) is merged, never lost.
        const merged = await idb.replaceMerged(STORE, (rows) => applyServer(rows, r.data.items, sent, rejected));
        emit();
        const accepted = dirty.length - (r.data.rejected || []).length;
        if (dirty.length === 200 && accepted > 0 && merged.some((t) => t.dirty)) again = true; // more to push, and the last pass made progress
      } while (again && passes < MAX_PASSES);
    } catch {
      /* IndexedDB unavailable: the in-memory list is simply not persisted */
    } finally {
      syncing = null;
    }
    return reached;
  })();
  return syncing;
}
