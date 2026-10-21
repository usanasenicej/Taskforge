import { useEffect, useRef, useState, type ReactNode } from "react";

/** Click-to-open popover anchored to its trigger; closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Consume it so an enclosing modal or drawer stays open.
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover-anchor" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div className={`popover ${align} ${className}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  active,
  danger,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button type="button" className={`menu-item ${active ? "active" : ""} ${danger ? "danger" : ""}`} onClick={onClick}>
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}
