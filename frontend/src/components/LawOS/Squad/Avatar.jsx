import AvatarArt from "@/components/LawOS/avatar/AvatarArt";

/** Initials avatar (there are no profile photos); colour chosen by the server per user. */
export default function Avatar({ person, size = 32, ring = false, title }) {
  const a = person?.avatar || { initials: "?", color: "var(--law-muted)" };
  // A student who drew an avatar in the studio is shown with it everywhere; the others get initials.
  if (person?.avatarConfig) return <AvatarArt config={person.avatarConfig} size={size} title={title ?? person?.name} />;
  return (
    <span
      title={title ?? person?.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: a.color,
        boxShadow: ring ? "0 0 0 2px var(--law-surface)" : undefined,
      }}
    >
      <bdi>{a.initials}</bdi>
    </span>
  );
}

/** Overlapping avatars for a list of people. */
export function AvatarStack({ people, size = 24, max = 5 }) {
  return (
    <span className="inline-flex items-center">
      {people.slice(0, max).map((p, i) => (
        <span key={`${p.userId}-${i}`} style={{ marginInlineStart: i ? -size / 3 : 0 }}>
          <Avatar person={p} size={size} ring title={p.percent !== undefined ? `${p.name} · ${p.percent}%` : p.name} />
        </span>
      ))}
    </span>
  );
}
