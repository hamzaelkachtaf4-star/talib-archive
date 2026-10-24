// Avatar art & Talib logo: exempt from ui-hex rule
import React from "react";

export const TalibLogo = ({ size = 32, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={`shrink-0 ${className}`} aria-hidden="true">
    <rect x="6" y="18" width="52" height="42" rx="12" fill="#035a32" />
    <rect x="6" y="14" width="52" height="42" rx="12" fill="#057a44" />
    <rect x="16" y="22" width="36" height="28" rx="8" fill="#fffdf6" />
    <ellipse cx="26" cy="35" rx="3.6" ry="4.6" fill="#0f172a" />
    <ellipse cx="42" cy="35" rx="3.6" ry="4.6" fill="#0f172a" />
    <circle cx="27.3" cy="33.2" r="1.4" fill="#ffffff" />
    <circle cx="43.3" cy="33.2" r="1.4" fill="#ffffff" />
    <path d="M27 42 Q34 49 41 42" fill="none" stroke="#0f172a" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M4 15 L32 3 L60 15 L32 26 Z" fill="#0f172a" />
    <line x1="54" y1="16" x2="54" y2="28" stroke="#b45309" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="54" cy="30" r="3" fill="#d97706" />
  </svg>
);

const SKIN = ["#f8dcc0", "#efc29b", "#d9a074", "#b47a4f", "#8a5636", "#5e3a24"];
const HAIR = ["#1c1a19", "#3b2418", "#6b4226", "#a8743f", "#d6b071", "#8a8f96", "#7a2e2a"];
const HIJAB = ["#0b5d3b", "#1f3a5f", "#8b3a52", "#d9c7a7", "#2a2a2a", "#c7a363", "#6b5b95", "#e9e4da"];
const TOPS = ["#0b5d3b", "#1f3a5f", "#3b5b9c", "#b4553f", "#8b3a52", "#c7a363", "#f1efe8", "#2a2a2a"];
const BGS = ["#d7efe3", "#dde6f7", "#f6e3cf", "#efe0f2", "#f3f0e6", "#cfe3f0", "#fbe7a1", "#f4d4d4"];

export function FallbackAvatar({ config: c, size }) {
  const skin = SKIN[c.skin] || SKIN[1], hair = HAIR[c.hairColor] || HAIR[0];
  const top = c.top === "robe" ? "#1c2430" : TOPS[c.topColor] || TOPS[0];
  const hij = c.hijab !== "none";
  const uid = `av-${c.skin}-${c.bg}-${c.top}-${c.hijab}-${c.beard}`;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className="block" aria-hidden="true">
      <defs><clipPath id={uid}><circle cx="100" cy="100" r="100" /></clipPath></defs>
      <circle cx="100" cy="100" r="100" fill={BGS[c.bg] || BGS[0]} />
      <g clipPath={`url(#${uid})`}>
        {hij && <path d="M50 112 C50 46 150 46 150 112 L156 172 C130 152 70 152 44 172 Z" fill={HIJAB[c.hijabColor] || HIJAB[0]} />}
        {!hij && c.hair === "long" && <path d="M58 94 C56 48 144 48 142 94 L148 156 C128 166 72 166 52 156 Z" fill={hair} />}
        <path d="M34 200 C34 152 66 138 100 138 C134 138 166 152 166 200 Z" fill={top} />
        {c.top === "robe" && <path d="M86 139 L100 152 L114 139 Z" fill="#ffffff" />}
        {c.beard !== "none" && <path d="M60 110 Q100 170 140 110 Q100 150 60 110 Z" fill={hair} />}
        <circle cx="100" cy="95" r="42" fill={skin} />
        <circle cx="85" cy="95" r="4" fill="#1c2430" />
        <circle cx="115" cy="95" r="4" fill="#1c2430" />
        <path d="M92 110 Q100 118 108 110" fill="none" stroke="#1c2430" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
