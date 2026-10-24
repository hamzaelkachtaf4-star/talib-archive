import { useCallback, useEffect, useState } from "react";
import Law from "@/models/law";

/** The module's content tree. Needs the server (the path trail is the only offline part of a module). */
export default function useModuleTree(moduleId) {
  const [nodes, setNodes] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    const r = await Law.moduleTree(moduleId);
    if (r.ok) { setNodes(r.data.nodes); setError(null); }
    else setError(r.offline ? "offline" : "error");
  }, [moduleId]);
  useEffect(() => { reload(); }, [reload]);
  const wrap = (fn) => async (...a) => { const r = await fn(...a); if (r.ok) await reload(); return r; };
  return {
    nodes, error, reload,
    add: wrap((body) => Law.moduleNodeAdd(moduleId, body)),
    edit: wrap((nid, body) => Law.moduleNodeEdit(moduleId, nid, body)),
    remove: wrap((nid) => Law.moduleNodeDelete(moduleId, nid)),
  };
}
