import { CalendarClock, CheckCircle2, Circle, CircleDashed, CircleDot, Eye } from "lucide-react";
import type { OrgRole, Task, TaskPriority, TaskStatus } from "../api/types";
import { PRIORITY_LABEL, ROLE_INFO, STATUS_LABEL, dueLabel, dueState } from "../lib/format";

const STATUS_ICON = { todo: Circle, in_progress: CircleDot, in_review: Eye, done: CheckCircle2 };

export function StatusIcon({ status, size = 16 }: { status: TaskStatus; size?: number }) {
  const Icon = STATUS_ICON[status] ?? CircleDashed;
  return <Icon size={size} className={`status-icon s-${status}`} aria-label={STATUS_LABEL[status]} />;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-badge s-${status}`}>
      <StatusIcon status={status} size={13} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Signal-strength style bars; urgent gets a filled alert square. */
export function PriorityIcon({ priority, size = 16 }: { priority: TaskPriority; size?: number }) {
  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="prio p-urgent" aria-label="Urgent">
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
        <rect x="7.1" y="3.8" width="1.8" height="5.2" rx="0.9" fill="#fff" />
        <circle cx="8" cy="11.4" r="1.05" fill="#fff" />
      </svg>
    );
  }
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`prio p-${priority}`} aria-label={PRIORITY_LABEL[priority]}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 4.6}
          y={10 - i * 3.5}
          width="3"
          height={4 + i * 3.5}
          rx="1"
          fill="currentColor"
          opacity={i < level ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`prio-badge p-${priority}`}>
      <PriorityIcon priority={priority} size={13} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function DueChip({ task, compact = false }: { task: Pick<Task, "due_date" | "status">; compact?: boolean }) {
  if (!task.due_date) return compact ? null : <span className="due-chip none">No due date</span>;
  return (
    <span className={`due-chip ${dueState(task)}`}>
      <CalendarClock size={12} />
      {dueLabel(task)}
    </span>
  );
}

export function RoleBadge({ role }: { role: OrgRole }) {
  return <span className={`role-badge r-${role}`}>{ROLE_INFO[role].label}</span>;
}
