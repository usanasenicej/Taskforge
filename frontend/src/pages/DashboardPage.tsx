import {
  Activity,
  AlarmClock,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  MessageSquare,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api/client";
import type { Member, Metrics, OrgEvent, Project, Task, TaskStatus } from "../api/types";
import { Avatar, AvatarStack } from "../components/Avatar";
import { DueChip, PriorityIcon, StatusIcon } from "../components/Badges";
import { useTaskComposer } from "../components/TaskComposer";
import { useAuth } from "../context/AuthContext";
import { useOrg, useOrgEvents } from "../context/OrgContext";
import { STATUSES, STATUS_LABEL, dueState, firstName, greeting, memberById, taskRef, timeAgo } from "../lib/format";

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--s-todo)",
  in_progress: "var(--s-progress)",
  in_review: "var(--s-review)",
  done: "var(--s-done)",
};

export function DashboardPage() {
  const { user } = useAuth();
  const { org, tasks, members, projects, can, ready } = useOrg();
  const compose = useTaskComposer();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activity, setActivity] = useState<OrgEvent[] | null>(null);
  const refreshTimer = useRef<number>();

  const loadMetrics = useCallback(() => {
    if (org) void api.metrics(org.id).then(setMetrics).catch(() => undefined);
  }, [org]);

  useEffect(() => {
    if (!org) return;
    setMetrics(null);
    setActivity(null);
    loadMetrics();
    void api.activity(org.id).then(setActivity).catch(() => setActivity([]));
  }, [org, loadMetrics]);

  useOrgEvents((event) => {
    if (event.type.startsWith("task.")) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(loadMetrics, 500);
    }
    if (["task.created", "task.updated", "task.deleted", "comment.created", "project.created"].includes(event.type)) {
      setActivity((current) => [event, ...(current ?? [])].slice(0, 40));
    }
  });

  const myTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "done" && t.assignee_ids.includes(user?.id ?? -1))
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    [tasks, user],
  );
  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < Date.now() + 7 * 86400_000)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
        .slice(0, 6),
    [tasks],
  );
  const myOverdue = myTasks.filter((t) => dueState(t) === "overdue").length;

  if (ready && projects.length === 0 && tasks.length === 0) {
    return <Onboarding canEdit={can.edit} orgName={org?.name ?? "your workspace"} />;
  }

  const total = metrics?.tasks_total ?? 0;
  const done = metrics?.tasks_by_status.done ?? 0;
  const completion = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="page dashboard">
      <section className="hello">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h2>
            {greeting()}, {firstName(user?.full_name)} <span className="wave">👋</span>
          </h2>
          <p className="muted">
            {myTasks.length === 0
              ? "Nothing on your plate right now. Nice."
              : `You have ${myTasks.length} open task${myTasks.length === 1 ? "" : "s"}${
                  myOverdue ? `, ${myOverdue} overdue` : ""
                }.`}
          </p>
        </div>
        {can.edit && (
          <button className="btn primary" type="button" onClick={() => compose()}>
            <Plus size={16} /> New task
          </button>
        )}
      </section>

      <section className="kpis">
        <Kpi
          icon={<CircleDot size={18} />}
          tone="indigo"
          label="Open tasks"
          value={metrics?.open_tasks}
          foot={`${metrics?.tasks_by_status.in_progress ?? 0} in progress`}
        />
        <Kpi
          icon={<AlarmClock size={18} />}
          tone="rose"
          label="Overdue"
          value={metrics?.tasks_overdue}
          foot={metrics?.tasks_overdue ? "Needs attention" : "All on schedule"}
          onClick={() => navigate("/board?due=overdue")}
        />
        <Kpi
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
          label="Completed"
          value={metrics ? `${completion}%` : undefined}
          foot={`${done} of ${total} tasks`}
          progress={completion}
        />
        <Kpi
          icon={<Sparkles size={18} />}
          tone="amber"
          label="Created today"
          value={metrics?.tasks_created_today}
          foot="Across all projects"
        />
      </section>

      <section className="dash-grid">
        <div className="card span-2">
          <CardHead title="My work" action={<Link to="/board?mine=1">View board <ArrowRight size={14} /></Link>} />
          {myTasks.length === 0 ? (
            <EmptyMini icon={<CheckCircle2 size={22} />} text="No open tasks assigned to you." />
          ) : (
            <ul className="task-rows">
              {myTasks.slice(0, 7).map((task) => (
                <TaskRow key={task.id} task={task} projects={projects} members={members} />
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <CardHead title="Status breakdown" />
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={STATUSES.map((s) => ({ name: STATUS_LABEL[s], value: metrics?.tasks_by_status[s] ?? 0, s }))}
                  dataKey="value"
                  innerRadius={56}
                  outerRadius={80}
                  paddingAngle={total ? 3 : 0}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {STATUSES.map((s) => (
                    <Cell key={s} fill={STATUS_COLOR[s]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--text)",
                    fontSize: 13,
                  }}
                  itemStyle={{ color: "var(--text)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{total}</strong>
              <span>tasks</span>
            </div>
          </div>
          <ul className="legend">
            {STATUSES.map((s) => (
              <li key={s}>
                <span className="legend-dot" style={{ background: STATUS_COLOR[s] }} />
                {STATUS_LABEL[s]}
                <strong>{metrics?.tasks_by_status[s] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <CardHead title="Upcoming deadlines" />
          {upcoming.length === 0 ? (
            <EmptyMini icon={<AlarmClock size={22} />} text="No deadlines in the next 7 days." />
          ) : (
            <ul className="deadlines">
              {upcoming.map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => navigate(`?task=${task.id}`)}>
                    <span className="deadline-title">{task.title}</span>
                    <DueChip task={task} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <CardHead title="Team workload" />
          <Workload tasks={tasks} members={members} />
        </div>

        <div className="card">
          <CardHead title="Projects" action={<Link to="/projects">All <ArrowRight size={14} /></Link>} />
          <ul className="project-progress">
            {projects.slice(0, 5).map((p) => {
              const ptasks = tasks.filter((t) => t.project_id === p.id);
              const pdone = ptasks.filter((t) => t.status === "done").length;
              const pct = ptasks.length ? Math.round((pdone / ptasks.length) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link to={`/board?project=${p.id}`}>
                    <span className="key-chip">{p.key}</span>
                    <span className="pp-name">{p.name}</span>
                    <span className="pp-pct">{pct}%</span>
                  </Link>
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            {projects.length === 0 && <EmptyMini icon={<FolderKanban size={22} />} text="No projects yet." />}
          </ul>
        </div>

        <div className="card span-full activity-card">
          <CardHead
            title="Live activity"
            action={
              <span className="muted small">
                <Activity size={13} /> Streams over Redis pub/sub
              </span>
            }
          />
          <ActivityFeed events={activity} members={members} projects={projects} tasks={tasks} />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  foot,
  progress,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number | string | undefined;
  foot: string;
  progress?: number;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`kpi t-${tone} ${onClick ? "clickable" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="kpi-icon">{icon}</span>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value ?? <span className="skeleton inline" />}</strong>
      <span className="kpi-foot">{foot}</span>
      {progress !== undefined && (
        <span className="kpi-bar">
          <span style={{ width: `${progress}%` }} />
        </span>
      )}
    </Tag>
  );
}

function CardHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="card-head">
      <h3>{title}</h3>
      {action && <span className="card-action">{action}</span>}
    </header>
  );
}

function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="empty-mini">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function TaskRow({ task, projects, members }: { task: Task; projects: Project[]; members: Member[] }) {
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === task.project_id);
  return (
    <li>
      <button type="button" className="task-row" onClick={() => navigate(`?task=${task.id}`)}>
        <StatusIcon status={task.status} />
        <span className="task-row-ref">{taskRef(project?.key, task.id)}</span>
        <span className="task-row-title">{task.title}</span>
        <PriorityIcon priority={task.priority} />
        <DueChip task={task} compact />
        <AvatarStack members={members.filter((m) => task.assignee_ids.includes(m.user_id))} size={22} />
      </button>
    </li>
  );
}

function Workload({ tasks, members }: { tasks: Task[]; members: Member[] }) {
  const rows = members
    .map((m) => {
      const open = tasks.filter((t) => t.status !== "done" && t.assignee_ids.includes(m.user_id));
      return { member: m, open: open.length, overdue: open.filter((t) => dueState(t) === "overdue").length };
    })
    .sort((a, b) => b.open - a.open);
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <ul className="workload">
      {rows.map(({ member, open, overdue }) => (
        <li key={member.user_id}>
          <Avatar name={member.full_name} size={26} />
          <div className="wl-main">
            <div className="wl-top">
              <span>{member.full_name}</span>
              <span className="muted small">
                {open} open{overdue ? ` · ${overdue} overdue` : ""}
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${(open / max) * 100}%` }} className={overdue ? "warn" : ""} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const EVENT_ICON: Record<string, React.ReactNode> = {
  "task.created": <Plus size={14} />,
  "task.updated": <PencilLine size={14} />,
  "task.deleted": <Trash2 size={14} />,
  "comment.created": <MessageSquare size={14} />,
  "project.created": <FolderKanban size={14} />,
};

function describe(event: OrgEvent, projects: Project[], tasks: Task[]) {
  const p = event.payload as Record<string, any>;
  const keyOf = (projectId: number) => projects.find((x) => x.id === projectId)?.key;
  const title = (p.title as string) ?? tasks.find((t) => t.id === p.task_id)?.title ?? "a task";
  switch (event.type) {
    case "task.created":
      return { verb: "created", object: title, ref: taskRef(keyOf(p.project_id), p.id), taskId: p.id as number };
    case "task.updated": {
      const changes = (p.changes ?? {}) as Record<string, [unknown, unknown]>;
      let verb = "updated";
      if (changes.status) verb = `moved to ${STATUS_LABEL[changes.status[1] as TaskStatus] ?? changes.status[1]}`;
      else if (changes.priority) verb = `set priority ${changes.priority[1]} on`;
      else if (changes.due_date) verb = changes.due_date[1] ? "rescheduled" : "cleared the due date on";
      else if (changes.title) verb = "renamed";
      else verb = "updated assignees on";
      return { verb, object: title, ref: taskRef(keyOf(p.project_id), p.id), taskId: p.id as number };
    }
    case "task.deleted":
      return { verb: "deleted", object: title, ref: "", taskId: null };
    case "comment.created":
      return { verb: "commented on", object: title, ref: "", taskId: p.task_id as number, quote: p.body as string };
    case "project.created":
      return { verb: "created project", object: `${p.key} · ${p.name}`, ref: "", taskId: null };
    default:
      return { verb: event.type, object: "", ref: "", taskId: null };
  }
}

function ActivityFeed({
  events,
  members,
  projects,
  tasks,
}: {
  events: OrgEvent[] | null;
  members: Member[];
  projects: Project[];
  tasks: Task[];
}) {
  const navigate = useNavigate();
  if (events === null) {
    return (
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 38 }} />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return <EmptyMini icon={<Activity size={22} />} text="Activity from your team will appear here in real time." />;
  }
  return (
    <ul className="feed">
      {events.slice(0, 12).map((event, i) => {
        const actor = memberById(members, event.actor_id)?.full_name ?? "Someone";
        const d = describe(event, projects, tasks);
        return (
          <li key={`${event.occurred_at}-${i}`} className={i === 0 ? "fresh" : ""}>
            <span className={`feed-icon e-${event.type.replace(".", "-")}`}>{EVENT_ICON[event.type]}</span>
            <div className="feed-text">
              <p>
                <strong>{actor}</strong> {d.verb}{" "}
                {d.taskId && tasks.some((t) => t.id === d.taskId) ? (
                  <button type="button" className="link-btn" onClick={() => navigate(`?task=${d.taskId}`)}>
                    {d.object}
                  </button>
                ) : (
                  <span className="feed-object">{d.object}</span>
                )}
                {d.ref && <span className="feed-ref">{d.ref}</span>}
              </p>
              {d.quote && <blockquote>“{d.quote}”</blockquote>}
            </div>
            <time>{timeAgo(event.occurred_at)}</time>
          </li>
        );
      })}
    </ul>
  );
}

function Onboarding({ canEdit, orgName }: { canEdit: boolean; orgName: string }) {
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="onboarding">
        <div className="onb-art">
          <FolderKanban size={34} />
        </div>
        <h2>Welcome to {orgName}</h2>
        <p className="muted">
          Get your team moving in three steps: create a project, invite teammates, and add your first tasks.
        </p>
        <ol className="onb-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Create a project</strong>
              <p>Group related work under a short key like WEB or API.</p>
            </div>
            {canEdit && (
              <button className="btn primary sm" type="button" onClick={() => navigate("/projects?new=1")}>
                Create
              </button>
            )}
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Invite your team</strong>
              <p>Give each person the right role — from Viewer to Admin.</p>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => navigate("/members")}>
              Invite
            </button>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Plan the work</strong>
              <p>Add tasks, set priorities and due dates, and track them on the board.</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
