import { Check, UserPlus } from "lucide-react";
import { useState } from "react";
import type { Member } from "../api/types";
import { Avatar, AvatarStack } from "./Avatar";
import { Popover } from "./Menu";

export function AssigneePicker({
  members,
  value,
  onChange,
  disabled,
  compact,
}: {
  members: Member[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = members.filter((m) => value.includes(m.user_id));
  const filtered = members.filter((m) =>
    `${m.full_name} ${m.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover
      className="picker"
      trigger={({ toggle }) => (
        <button type="button" className="field-btn" onClick={toggle} disabled={disabled}>
          {selected.length ? (
            <>
              <AvatarStack members={selected} size={22} max={4} />
              {!compact && (
                <span className="field-btn-text">
                  {selected.length === 1 ? selected[0].full_name : `${selected.length} people`}
                </span>
              )}
            </>
          ) : (
            <>
              <UserPlus size={15} />
              <span className="field-btn-text muted">Assign</span>
            </>
          )}
        </button>
      )}
    >
      {() => (
        <>
          <input
            className="picker-search"
            placeholder="Search people…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-list">
            {filtered.map((m) => {
              const on = value.includes(m.user_id);
              return (
                <button
                  type="button"
                  key={m.user_id}
                  className={`menu-item ${on ? "active" : ""}`}
                  onClick={() => onChange(on ? value.filter((id) => id !== m.user_id) : [...value, m.user_id])}
                >
                  <Avatar name={m.full_name} size={22} />
                  <span className="menu-label">
                    {m.full_name}
                    <small>{m.email}</small>
                  </span>
                  {on && <Check size={15} className="menu-check" />}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="picker-empty">No one matches “{query}”</p>}
          </div>
        </>
      )}
    </Popover>
  );
}
