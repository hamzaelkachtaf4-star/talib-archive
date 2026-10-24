// RC3 Phase 7: who may do what inside a study squad. One table, used by every squad endpoint, so the rules are testable
// in isolation. The legacy role "contributor" (Collab) is an editor.
const ROLES = Object.freeze(["owner", "admin", "editor", "viewer"]);
const RANK = Object.freeze({ viewer: 0, editor: 1, admin: 2, owner: 3 });

const ACTIONS = Object.freeze({
  "doc.read": "viewer",
  "doc.create": "editor",
  "doc.edit_any": "admin",
  "cr.create": "editor",
  "cr.review": "admin",
  "member.invite_roles": "admin",
  "squad.delete": "owner",
});

const normalizeRole = (r) => (r === "contributor" ? "editor" : r);
const known = (r) => Object.prototype.hasOwnProperty.call(RANK, normalizeRole(r));
const rank = (r) => RANK[normalizeRole(r)];

function can(role, action) {
  if (!known(role) || !(action in ACTIONS)) return false;
  return rank(role) >= RANK[ACTIONS[action]];
}

/** `actor` gives `target` the role `next`. Owner may set admin/editor/viewer; an admin only editor/viewer, and never on an admin or owner. */
function canAssign(actor, targetCurrent, next) {
  if (!known(actor) || !known(targetCurrent) || !known(next)) return false;
  if (normalizeRole(next) === "owner" || normalizeRole(targetCurrent) === "owner") return false; // ownership moves only through transfer
  if (normalizeRole(actor) === "owner") return true;
  if (normalizeRole(actor) === "admin") return rank(targetCurrent) < RANK.admin && rank(next) < RANK.admin;
  return false;
}

function canRemove(actor, target) {
  if (!known(actor) || !known(target)) return false;
  const a = normalizeRole(actor);
  if (a === "owner") return normalizeRole(target) !== "owner";
  if (a === "admin") return rank(target) < RANK.admin;
  return false;
}

/** Authors and admins change a doc in place; any other editor proposes a change request. */
const canEditDirect = (role, isAuthor) => known(role) && (can(role, "doc.edit_any") || (isAuthor && can(role, "doc.create")));

/** Reviewers cannot approve their own request (the owner may: a squad of one still has to be able to work). */
const canReviewCR = (role, isOwnRequest) => can(role, "cr.review") && (!isOwnRequest || normalizeRole(role) === "owner");

module.exports = { ROLES, ACTIONS, normalizeRole, can, canAssign, canRemove, canEditDirect, canReviewCR };
