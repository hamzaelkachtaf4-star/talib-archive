// Markdown policy for user-authored content (Hub notes, master notes). Raw HTML is off; only http(s), mailto and
// scheme-less (relative / #anchor) links survive, so javascript:, data:, vbscript: and file: never become an href.
// External links open in a new tab without leaking the opener. DOMPurify stays on as a second fence.
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED = /^(https?|mailto):/i;

export function createMarkdown(MarkdownIt) {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
  md.validateLink = (url) => {
    const u = String(url).trim();
    return !SCHEME.test(u) || ALLOWED.test(u);
  };
  const open = md.renderer.rules.link_open || ((tokens, i, o, _e, self) => self.renderToken(tokens, i, o));
  md.renderer.rules.link_open = (tokens, i, o, env, self) => {
    const href = tokens[i].attrGet("href") || "";
    if (/^https?:/i.test(href)) {
      tokens[i].attrSet("target", "_blank");
      tokens[i].attrSet("rel", "noopener noreferrer nofollow");
    }
    return open(tokens, i, o, env, self);
  };
  return md;
}
