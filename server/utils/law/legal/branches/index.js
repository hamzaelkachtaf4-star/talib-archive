// Branch reasoning modules (RC2 2.2): versioned, selected from the domains of the codes the student selected.
// The rules shape HOW to reason; the law itself still comes only from the retrieved corpus blocks.
const MODULES = [require("./commercial"), require("./criminal"), require("./administrative"), require("./family")];

/** @param {string[]} domains LawCode.domain values of the codes in scope */
function branchesFor(domains) {
  const set = new Set(domains);
  return MODULES.filter((m) => m.domains.some((d) => set.has(d)));
}

/** Prompt block (data, not instructions to obey blindly): empty when no branch applies. */
function branchBlock(domains) {
  const bs = branchesFor(domains);
  if (!bs.length) return "";
  return `<branch_rules>\n${bs.map((b) => `- (${b.id} v${b.version}) ${b.rules}`).join("\n")}\n</branch_rules>`;
}

module.exports = { branchesFor, branchBlock, MODULES };
