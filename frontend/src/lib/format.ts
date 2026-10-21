import type { Member, OrgRole, Task, TaskPriority, TaskStatus } from "../api/types";

const PALETTE = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
export const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
export const ROLES: OrgRole[] = ["owner", "admin", "member", "viewer"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ROLE_INFO: Record<OrgRole, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Full control, including deleting projects and managing admins" },
  admin: { label: "Admin", blurb: "Manage members, projects and every task" },
  member: { label: "Member", blurb: "Create and update projects, tasks and comments" },
  viewer: { label: "Viewer", blurb: "Read-only access to the workspace" },
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function colorFor(key: string | number) {
  let hash = 0;
  for (const char of String(key)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function memberById(members: Member[], id: number | null | undefined) {
  return members.find((member) => member.user_id === id);
}

export function firstName(name?: string | null) {
  return (name ?? "").split(" ")[0] || "there";
}

export function formatDate(value?: string | null, withYear = false) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(value, true);
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later" | "done";

export function dueState(task: Pick<Task, "due_date" | "status">): DueState {
  if (!task.due_date) return "none";
  if (task.status === "done") return "done";
  const due = new Date(task.due_date);
  const now = new Date();
  if (due.getTime() < now.getTime()) return "overdue";
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < startOfTomorrow) return "today";
  if (due.getTime() - now.getTime() < 3 * 86400_000) return "soon";
  return "later";
}

export function dueLabel(task: Pick<Task, "due_date" | "status">) {
  if (!task.due_date) return "No due date";
  const state = dueState(task);
  const due = new Date(task.due_date);
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86400_000);
  if (state === "overdue") return days === 0 ? "Overdue today" : `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7 && days > 0) return `Due ${due.toLocaleDateString(undefined, { weekday: "short" })}`;
  return `Due ${formatDate(task.due_date)}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** <input type="date"> value (local) → ISO timestamp at the end of that local day. */
export function dateInputToIso(value: string) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 0).toISOString();
}

/** ISO timestamp → <input type="date"> value in local time. */
export function isoToDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function taskRef(projectKey: string | undefined, taskId: number) {
  return `${projectKey ?? "TF"}-${taskId}`;
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
