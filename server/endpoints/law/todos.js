// RC3 Phase 2: /api/law/todos (offline-first sync) for the Today dashboard.
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawTodo } = require("../../models/lawTodo");

const bad = (res, error) => res.status(400).json({ error: { code: error, message: error } });

function lawTodoEndpoints(router) {
  router.get("/law/todos", auth, handle("todos_list", async (_req, res) => {
    res.json({ items: await LawTodo.list(res.locals.lawUser.id) });
  }));
  router.post("/law/todos/sync", auth, handle("todos_sync", async (req, res) => {
    const body = reqBody(req);
    const r = await LawTodo.sync(res.locals.lawUser.id, body.items);
    if (r.error) return bad(res, r.error);
    res.json(r);
  }));
}

module.exports = { lawTodoEndpoints };
