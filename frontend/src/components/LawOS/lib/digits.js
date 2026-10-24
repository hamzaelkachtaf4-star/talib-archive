// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Western, so "الفصل ٧٧" and "الفصل 77" display and
// resolve identically (spec §1.7, §6.4). The server uses the same mapping for search normalization.
const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;

export function toWesternDigits(value) {
  return String(value ?? "")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0));
}
