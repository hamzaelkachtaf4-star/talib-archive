import { sanitizeAvatar } from "./avatarConfig";
import * as C from "./avatarPalette";

const HEAD = { cx: 50, cy: 44 };

function Head({ face, skin }) {
  if (face === "round") return <ellipse cx={HEAD.cx} cy={HEAD.cy} rx="21" ry="21" fill={skin} />;
  if (face === "square") return <rect x="30" y="23" width="40" height="42" rx="11" fill={skin} />;
  return <ellipse cx={HEAD.cx} cy={HEAD.cy} rx="20" ry="22" fill={skin} />;
}

function Outfit({ kind }) {
  const fill = C.OUTFIT[kind] || C.OUTFIT.casual;
  return (
    <g data-layer="outfit" data-outfit={kind}>
      <path d="M12 100 Q14 70 50 68 Q86 70 88 100Z" fill={fill} />
      {kind === "suit" && <path d="M44 69 L50 84 L56 69Z" fill={C.WHITE} />}
      {kind === "robe" && <rect x="47" y="68" width="6" height="32" fill={C.GOLD} />}
      {kind === "judge" && (
        <>
          <path d="M28 74 L40 69.5 L76 100 L60 100Z" fill={C.SASH} />
          <path d="M44 69 L50 80 L56 69Z" fill={C.WHITE} />
        </>
      )}
      {kind === "lawyer" && (
        <>
          <path d="M40 69 L50 90 L60 69 L56 68.5 L50 80 L44 68.5Z" fill={C.WHITE} opacity="0.18" />
          <rect x="45.2" y="69" width="3.6" height="11" fill={C.WHITE} />
          <rect x="51.2" y="69" width="3.6" height="11" fill={C.WHITE} />
        </>
      )}
      {kind === "adoul" && (
        <>
          <path d="M34 72 Q50 62 66 72 Q50 78 34 72Z" fill={C.TRIM} opacity="0.5" />
          <path d="M50 74 V100" stroke={C.TRIM} strokeWidth="1.6" />
        </>
      )}
      {kind === "professor" && (
        <>
          <path d="M44 69 L50 86 L56 69Z" fill={C.WHITE} />
          <path d="M49 72 H51 L52 86 L50 89 L48 86Z" fill={C.TIE} />
        </>
      )}
      {kind === "student" && (
        <>
          <path d="M42 69 Q50 77 58 69" stroke={C.WHITE} strokeWidth="2" fill="none" />
          <path d="M26 82 L36 100 M74 82 L64 100" stroke={C.GOLD} strokeWidth="3" />
        </>
      )}
    </g>
  );
}

const MOUTH = {
  smile: <path d="M42 53 Q50 63 58 53" stroke={C.INK} strokeWidth="2" fill="none" strokeLinecap="round" />,
  serious: <path d="M44 55.5 H56" stroke={C.INK} strokeWidth="2" strokeLinecap="round" />,
  focused: <path d="M45 55 Q50 56.5 55 55" stroke={C.INK} strokeWidth="2" fill="none" strokeLinecap="round" />,
  calm: <path d="M44 54 Q50 59 56 54" stroke={C.INK} strokeWidth="2" fill="none" strokeLinecap="round" />,
};
/** The mouth: the expression is what the student reads in the face; eyes and brows are separate layers they choose. */
function Expression({ kind }) {
  return <g data-layer="expression" data-expression={MOUTH[kind] ? kind : "calm"}>{MOUTH[kind] || MOUTH.calm}</g>;
}

function Eyes({ kind }) {
  if (kind === "almond") return <g data-layer="eyes" data-eyes={kind}><ellipse cx="43" cy="44" rx="3.2" ry="1.9" fill={C.INK} /><ellipse cx="57" cy="44" rx="3.2" ry="1.9" fill={C.INK} /></g>;
  if (kind === "narrow") return <g data-layer="eyes" data-eyes={kind}><rect x="40" y="43" width="6.4" height="1.8" rx="0.9" fill={C.INK} /><rect x="53.6" y="43" width="6.4" height="1.8" rx="0.9" fill={C.INK} /></g>;
  return <g data-layer="eyes" data-eyes="round"><circle cx="43" cy="44" r="2" fill={C.INK} /><circle cx="57" cy="44" r="2" fill={C.INK} /></g>;
}

function Brows({ kind }) {
  const p = (d, w) => <path d={d} stroke={C.INK} strokeWidth={w} fill="none" strokeLinecap="round" />;
  if (kind === "thick") return <g data-layer="brows" data-brows={kind}>{p("M38.5 38.5 Q43 36.5 47.5 38.5 M52.5 38.5 Q57 36.5 61.5 38.5", 2.8)}</g>;
  if (kind === "arched") return <g data-layer="brows" data-brows={kind}>{p("M39 39 Q43 33.5 47 38 M53 38 Q57 33.5 61 39", 1.6)}</g>;
  if (kind === "thin") return <g data-layer="brows" data-brows={kind}>{p("M39.5 38 H46.5 M53.5 38 H60.5", 1)}</g>;
  return <g data-layer="brows" data-brows="natural">{p("M39 38.5 Q43 37 47 38.5 M53 38.5 Q57 37 61 38.5", 1.6)}</g>;
}

function FacialHair({ kind }) {
  if (kind === "moustache") return <path data-layer="facialHair" data-facial-hair={kind} d="M41.5 51 Q46 48.5 50 50.5 Q54 48.5 58.5 51 Q54 53 50 52 Q46 53 41.5 51Z" fill={C.HAIR} />;
  if (kind === "beard") return <path data-layer="facialHair" data-facial-hair={kind} d="M30 50 Q30 74 50 74 Q70 74 70 50 Q64 62 50 62 Q36 62 30 50Z M41.5 51 Q46 48.5 50 50.5 Q54 48.5 58.5 51 Q54 53 50 52 Q46 53 41.5 51Z" fill={C.HAIR} />;
  if (kind === "goatee") return <path data-layer="facialHair" data-facial-hair={kind} d="M44 60 Q50 72 56 60 Q50 63 44 60Z M42.5 51 Q46 49 50 50.5 Q54 49 57.5 51 Q54 52.5 50 52 Q46 52.5 42.5 51Z" fill={C.HAIR} />;
  return null;
}

function Headwear({ kind }) {
  if (kind === "hijab") return <path data-layer="headwear" d="M24 46 Q22 18 50 18 Q78 18 76 46 Q76 70 62 78 L38 78 Q24 70 24 46Z M32 46 Q34 62 50 64 Q66 62 68 46 Q66 30 50 30 Q34 30 32 46Z" fill={C.HIJAB} fillRule="evenodd" />;
  if (kind === "tarboosh") return <g data-layer="headwear"><path d="M33 28 L36 12 Q50 8 64 12 L67 28Z" fill={C.TARBOOSH} /><path d="M50 12 Q60 6 66 14" stroke={C.INK} strokeWidth="2" fill="none" /><circle cx="66" cy="15" r="2.5" fill={C.INK} /></g>;
  if (kind === "cap") return <path data-layer="headwear" d="M29 34 Q30 14 50 14 Q70 14 71 34Z M66 32 L84 36 L66 38Z" fill={C.INK} />;
  if (kind === "rezza") return <g data-layer="headwear"><path d="M27 34 Q28 10 50 10 Q72 10 73 34 Q50 24 27 34Z" fill={C.WHITE} /><path d="M32 26 Q50 17 68 26 M31 31 Q50 22 69 31" stroke={C.TRIM} strokeWidth="1.2" fill="none" /></g>;
  return null;
}

function Accessory({ kind }) {
  if (kind === "glasses") return <g data-layer="accessory" stroke={C.INK} strokeWidth="1.8" fill="none"><circle cx="43" cy="44" r="6" /><circle cx="57" cy="44" r="6" /><path d="M49 44 H51" /></g>;
  if (kind === "book") return <g data-layer="accessory"><rect x="60" y="76" width="26" height="18" rx="2" fill={C.BOOK} /><path d="M73 76 V94" stroke={C.WHITE} strokeWidth="1.5" /></g>;
  if (kind === "gavel") return <g data-layer="accessory"><rect x="62" y="74" width="22" height="9" rx="2" fill={C.WOOD} transform="rotate(-25 73 78)" /><rect x="70" y="80" width="4" height="16" fill={C.WOOD_DARK} transform="rotate(-25 72 88)" /></g>;
  if (kind === "scales") return <g data-layer="accessory" stroke={C.GOLD} strokeWidth="1.8" fill="none"><path d="M73 74 V96 M64 78 H82 M64 78 L60 87 H68Z M82 78 L78 87 H86Z M68 96 H78" /></g>;
  if (kind === "scroll") return <g data-layer="accessory"><rect x="62" y="76" width="24" height="14" rx="3" fill={C.WHITE} /><path d="M66 81 H82 M66 85 H78" stroke={C.INK} strokeWidth="1.2" /><circle cx="62" cy="83" r="3.2" fill={C.TRIM} /><circle cx="86" cy="83" r="3.2" fill={C.TRIM} /></g>;
  return null;
}

/**
 * Layered SVG avatar: background, outfit, neck, face, hair, headwear, expression, accessory. Anything outside the closed
 * vocabulary falls back to the default (sanitizeAvatar), so stored junk can never break the art.
 */
export default function AvatarArt({ config, size = 96, title }) {
  const c = sanitizeAvatar(config);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} aria-hidden={title ? undefined : true} style={{ borderRadius: "50%", flex: "none" }}>
      <rect data-layer="bg" width="100" height="100" fill={c.bg} />
      <Outfit kind={c.outfit} />
      <rect data-layer="neck" x="44" y="58" width="12" height="12" rx="4" fill={c.skinTone} />
      {c.hair === "long" && <path data-layer="hair" d="M26 46 Q24 80 34 84 L34 50Z M74 46 Q76 80 66 84 L66 50Z" fill={C.HAIR} />}
      <g data-layer="face" data-face={c.face}><Head face={c.face} skin={c.skinTone} /></g>
      {c.hair !== "none" && c.headwear !== "hijab" && c.headwear !== "rezza" && (
        <path data-layer="hair" d={c.hair === "curly" ? "M28 40 Q26 18 50 20 Q74 18 72 40 Q64 28 50 30 Q36 28 28 40Z" : "M29 40 Q30 21 50 21 Q70 21 71 40 Q62 31 50 32 Q38 31 29 40Z"} fill={C.HAIR} />
      )}
      <Headwear kind={c.headwear} />
      <Eyes kind={c.eyes} />
      <Brows kind={c.brows} />
      <Expression kind={c.expression} />
      <FacialHair kind={c.facialHair} />
      <Accessory kind={c.accessory} />
    </svg>
  );
}
