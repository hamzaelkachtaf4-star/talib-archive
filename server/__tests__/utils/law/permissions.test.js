const P = require("../../../utils/law/permissions");

describe("squad role permissions", () => {
  const roles = ["owner", "admin", "editor", "viewer"];
  const matrix = {
    "doc.read": [1, 1, 1, 1],
    "doc.create": [1, 1, 1, 0],
    "doc.edit_any": [1, 1, 0, 0],
    "cr.create": [1, 1, 1, 0],
    "cr.review": [1, 1, 0, 0],
    "member.invite_roles": [1, 1, 0, 0],
    "squad.delete": [1, 0, 0, 0],
  };
  for (const [action, expected] of Object.entries(matrix))
    test(`${action}`, () => roles.forEach((r, i) => expect(P.can(r, action)).toBe(!!expected[i])));

  test("legacy 'contributor' counts as editor; unknown roles and actions are denied", () => {
    expect(P.normalizeRole("contributor")).toBe("editor");
    expect(P.can("contributor", "doc.create")).toBe(true);
    expect(P.can("contributor", "cr.review")).toBe(false);
    expect(P.can("god", "doc.read")).toBe(false);
    expect(P.can(null, "doc.read")).toBe(false);
    expect(P.can("owner", "unknown.action")).toBe(false);
  });
  test("role changes: owner sets anything below owner; admin only editor/viewer and never touches admin/owner", () => {
    expect(P.canAssign("owner", "editor", "admin")).toBe(true);
    expect(P.canAssign("owner", "admin", "viewer")).toBe(true);
    expect(P.canAssign("owner", "owner", "admin")).toBe(false); // ownership moves only through transfer
    expect(P.canAssign("admin", "editor", "viewer")).toBe(true);
    expect(P.canAssign("admin", "viewer", "editor")).toBe(true);
    expect(P.canAssign("admin", "admin", "editor")).toBe(false);
    expect(P.canAssign("admin", "editor", "admin")).toBe(false);
    expect(P.canAssign("editor", "viewer", "editor")).toBe(false);
    expect(P.canAssign("viewer", "viewer", "editor")).toBe(false);
    expect(P.canAssign("owner", "editor", "superuser")).toBe(false);
  });
  test("removal follows the same hierarchy", () => {
    expect(P.canRemove("owner", "admin")).toBe(true);
    expect(P.canRemove("admin", "editor")).toBe(true);
    expect(P.canRemove("admin", "admin")).toBe(false);
    expect(P.canRemove("admin", "owner")).toBe(false);
    expect(P.canRemove("editor", "viewer")).toBe(false);
  });
  test("direct edit: the author of a doc or an admin; an editor who is not the author must go through a change request", () => {
    expect(P.canEditDirect("editor", true)).toBe(true);
    expect(P.canEditDirect("editor", false)).toBe(false);
    expect(P.canEditDirect("viewer", true)).toBe(false);
    expect(P.canEditDirect("admin", false)).toBe(true);
  });
  test("self-approval: only the owner may merge their own change request", () => {
    expect(P.canReviewCR("admin", true)).toBe(false);
    expect(P.canReviewCR("admin", false)).toBe(true);
    expect(P.canReviewCR("owner", true)).toBe(true);
    expect(P.canReviewCR("editor", false)).toBe(false);
  });
});
