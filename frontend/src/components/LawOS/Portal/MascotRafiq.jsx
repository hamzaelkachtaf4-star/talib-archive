import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";

const INK = "#1c2430";
const GOLD = "#e6b93c";
const GOLD_DK = "#b48a2c";

/** Shared face: big glossy eyes, blush and a smile. `look` shifts the pupils (reading pose glances down). */
function Face({ cx = 160, cy = 172, s = 1, look = 0, cheer = false }) {
  const ex = 26 * s;
  return (
    <g className="qm-face">
      <g className="qm-eyes">
        {[-ex, ex].map((dx) => (
          <g key={dx}>
            <ellipse cx={cx + dx} cy={cy} rx={15 * s} ry={19 * s} fill={INK} />
            <circle cx={cx + dx + 5 * s} cy={cy - 7 * s + look * s} r={6 * s} fill="#fff" />
            <circle cx={cx + dx - 5 * s} cy={cy + 6 * s + look * s} r={2.6 * s} fill="#fff" opacity="0.8" />
          </g>
        ))}
      </g>
      <ellipse cx={cx - 46 * s} cy={cy + 34 * s} rx={11 * s} ry={7 * s} fill="#f4a3a3" opacity="0.75" />
      <ellipse cx={cx + 46 * s} cy={cy + 34 * s} rx={11 * s} ry={7 * s} fill="#f4a3a3" opacity="0.75" />
      {cheer ? (
        <path d={`M${cx - 24 * s} ${cy + 30 * s} Q${cx} ${cy + 66 * s} ${cx + 24 * s} ${cy + 30 * s} Z`} fill={INK} />
      ) : (
        <path
          d={`M${cx - 20 * s} ${cy + 32 * s} Q${cx} ${cy + 56 * s} ${cx + 20 * s} ${cy + 32 * s} Q${cx} ${cy + 42 * s} ${cx - 20 * s} ${cy + 32 * s}Z`}
          fill={INK} stroke={INK} strokeWidth={5 * s} strokeLinejoin="round"
        />
      )}
    </g>
  );
}

/** Graduation cap with a swinging tassel. */
function Cap({ x = 160, y = 76, w = 100 }) {
  return (
    <g className="qm-cap">
      <path d={`M${x - w} ${y} L${x} ${y - 44} L${x + w} ${y} L${x} ${y + 40} Z`} fill={INK} />
      <path d={`M${x - 50} ${y + 20} V${y + 50} Q${x} ${y + 72} ${x + 50} ${y + 50} V${y + 20} L${x} ${y + 40} Z`} fill="#2b3544" />
      <g className="qm-tassel">
        <line x1={x + 76} y1={y + 6} x2={x + 76} y2={y + 50} stroke={GOLD_DK} strokeWidth="5" strokeLinecap="round" />
        <circle cx={x + 76} cy={y + 54} r="8" fill={GOLD} />
      </g>
    </g>
  );
}

function Book({ children }) {
  return (
    <>
      <rect x="66" y="104" width="188" height="200" rx="26" fill="#034d2b" />
      <rect x="66" y="96" width="188" height="200" rx="26" fill="#0b5d3b" />
      <rect x="66" y="96" width="30" height="200" rx="14" fill="#06462b" />
      <rect x="104" y="114" width="132" height="168" rx="16" fill="#fffdf6" />
      <rect x="104" y="266" width="132" height="16" rx="8" fill="#e9e1cc" />
      <path d="M120 100 V150 L130 140 L140 150 V100Z" fill={GOLD} opacity="0.95" />
      {children}
    </>
  );
}

function Sparkle({ x, y, r = 10, delay = 0 }) {
  return (
    <path
      className="qm-sparkle"
      style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
      fill={GOLD}
    />
  );
}

/** Floating "article" page with a lines glyph. */
function Page({ x, y, rot, delay, label }) {
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <g className="qm-page" style={{ animationDelay: `${delay}s` }}>
        <rect x={x - 22} y={y - 28} width="44" height="56" rx="7" fill="#fff" stroke="#d6dde6" strokeWidth="2" />
        <rect x={x - 14} y={y - 18} width="28" height="5" rx="2.5" fill="#0b5d3b" />
        <rect x={x - 14} y={y - 7} width="28" height="4" rx="2" fill="#cbd5e1" />
        <rect x={x - 14} y={y + 2} width="20" height="4" rx="2" fill="#cbd5e1" />
        {label && <text x={x} y={y + 21} textAnchor="middle" fontSize="11" fontWeight="700" fill={GOLD_DK}>{label}</text>}
      </g>
    </g>
  );
}

const CONFETTI = ["#e6b93c", "#0b5d3b", "#f4a3a3", "#4aa3df", "#e6b93c", "#58a700", "#c2570c", "#f4a3a3"];

/**
 * The mascot: the living law book mascot (cap, face, tassel).
 * pose: "happy" (waving, floating articles) | "reading" (quill and scroll) | "celebrating" (confetti) | "logo" (face only).
 */
export default function MascotRafiq({ pose = "happy", className = "", title }) {
  const label = title ?? tr("شخصية {0}: كتاب قانون مبتسم بقبعة التخرج", [brandName(lang())]);

  if (pose === "logo") {
    return (
      <svg viewBox="0 0 64 64" className={`qm qm-logo ${className}`.trim()} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
        <rect x="6" y="18" width="52" height="42" rx="12" fill="#034d2b" />
        <rect x="6" y="14" width="52" height="42" rx="12" fill="#0b5d3b" />
        <rect x="16" y="22" width="36" height="28" rx="8" fill="#fffdf6" />
        <ellipse cx="26" cy="35" rx="3.6" ry="4.6" fill={INK} />
        <ellipse cx="42" cy="35" rx="3.6" ry="4.6" fill={INK} />
        <circle cx="27.3" cy="33.2" r="1.4" fill="#fff" />
        <circle cx="43.3" cy="33.2" r="1.4" fill="#fff" />
        <path d="M27 42 Q34 49 41 42" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M4 15 L32 3 L60 15 L32 26 Z" fill={INK} />
        <line x1="54" y1="16" x2="54" y2="28" stroke={GOLD_DK} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="54" cy="30" r="3" fill={GOLD} />
      </svg>
    );
  }

  const celebrating = pose === "celebrating";
  const reading = pose === "reading";

  return (
    <svg viewBox="0 0 320 340" className={`qm qm-${pose} portal-mascot ${className}`.trim()} role="img" aria-label={label}>
      <ellipse cx="160" cy="320" rx="92" ry="12" fill="#000" opacity="0.08" className="qm-shadow" />
      {pose === "happy" && (
        <>
          <Page x={36} y={120} rot={-14} delay={0} label="ف 77" />
          <Page x={290} y={96} rot={12} delay={0.7} label="ف 230" />
          <Page x={282} y={226} rot={-8} delay={1.4} />
          <Sparkle x={52} y={62} r={11} />
          <Sparkle x={272} y={34} r={9} delay={0.5} />
          <Sparkle x={300} y={170} r={8} delay={1} />
        </>
      )}
      {celebrating && (
        <g aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <g key={i} transform={`translate(${44 + i * 33} ${27 + (i % 3) * 26}) rotate(${i * 37})`}>
              <rect className="qm-confetti" style={{ animationDelay: `${i * 0.12}s` }} x="-4.5" y="-7" width="9" height="14" rx="2" fill={c} />
            </g>
          ))}
          <Sparkle x={48} y={110} r={12} />
          <Sparkle x={278} y={100} r={12} delay={0.4} />
        </g>
      )}

      <g className="qm-body">
        {/* arms */}
        <g className={celebrating ? "qm-arm qm-arm-up" : "qm-arm qm-arm-wave"} style={{ transformOrigin: "254px 200px" }}>
          <path d="M248 196 Q290 190 296 150" fill="none" stroke="#0b5d3b" strokeWidth="18" strokeLinecap="round" />
          <circle cx="296" cy="146" r="12" fill="#fffdf6" stroke="#d6dde6" strokeWidth="2" />
        </g>
        <path
          d={celebrating ? "M72 196 Q30 190 24 150" : "M72 220 Q40 236 46 262"}
          fill="none" stroke="#0b5d3b" strokeWidth="18" strokeLinecap="round"
        />
        <circle cx={celebrating ? 24 : 46} cy={celebrating ? 146 : 266} r="12" fill="#fffdf6" stroke="#d6dde6" strokeWidth="2" />
        <Book>
          <Face cy={176} look={reading ? 5 : 0} cheer={celebrating} />
        </Book>
        <Cap />
        {reading && (
          <g className="qm-quill">
            <path d="M300 130 Q318 96 312 66 Q290 84 286 118Z" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
            <path d="M300 130 L284 160" stroke={GOLD_DK} strokeWidth="4" strokeLinecap="round" />
          </g>
        )}
      </g>
    </svg>
  );
}
