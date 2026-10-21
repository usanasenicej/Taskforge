import type { Member } from "../api/types";
import { colorFor, initials } from "../lib/format";

export function Avatar({ name, size = 28, ring = false }: { name: string; size?: number; ring?: boolean }) {
  return (
    <span
      className={`avatar ${ring ? "ring" : ""}`}
      title={name}
      style={{ width: size, height: size, background: colorFor(name), fontSize: Math.max(size * 0.38, 9) }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ members, max = 3, size = 24 }: { members: Member[]; max?: number; size?: number }) {
  if (members.length === 0) return <span className="avatar-empty" style={{ width: size, height: size }} title="Unassigned" />;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((m) => (
        <Avatar key={m.user_id} name={m.full_name} size={size} ring />
      ))}
      {extra > 0 && (
        <span className="avatar ring more" style={{ width: size, height: size, fontSize: size * 0.38 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
