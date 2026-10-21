import { LayoutGrid, List, MessageSquare, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Task, TaskPriority, TaskStatus } from "../api/types";
import { AvatarStack } from "../components/Avatar";
import { DueChip, PriorityBadge, PriorityIcon, StatusBadge, StatusIcon } from "../components/Badges";
import { useTaskComposer } from "../components/TaskComposer";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, dueState, formatDate, taskRef } from "../lib/format";

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function BoardPage() {
  const { org, tasks, projects, members, can, upsertTask, ready } = useOrg();
  const { user } = useAuth();
  const compose = useTaskComposer();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const view = params.get("view") === "list" ? "list" : "board";
  const projectFilter = Number(params.get("project")) || null;
  const mine = params.get("mine") === "1";
  const assignee = Number(params.get("assignee")) || null;
  const priority = (params.get("priority") as TaskPriority | null) ?? null;
  const dueFilter = params.get("due");
  const query = params.get("q") ?? "";

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => !projectFilter || t.project_id === projectFilter)
      .filter((t) => !mine || t.assignee_ids.includes(user?.id ?? -1))
      .filter((t) => !assignee || t.assignee_ids.includes(assignee))
      .filter((t) => !priority || t.priority === priority)
      .filter((t) => dueFilter !== "overdue" || dueState(t) === "overdue")
      .filter((t) => !q || t.title.toLowerCase().includes(q) || String(t.id) === q.replace(/\D/g, ""))
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
          b.id - a.id,
      );
  }, [tasks, projectFilter, mine, assignee, priority, dueFilter, query, user]);

  const activeFilters = [projectFilter, mine, assignee, priority, dueFilter, query].filter(Boolean).length;
  const keyFor = (projectId: number) => projects.find((p) => p.id === projectId)?.key;
  const openTask = (id: number) => setParam("task", String(id));

  const move = async (task: Task, status: TaskStatus) => {
    if (!org || task.status === status) return;
    upsertTask({ ...task, status });
    try {
      upsertTask(await api.updateTask(org.id, task.id, { status }));
      if (status === "done") toast({ tone: "success", title: "Nice work!", body: `${taskRef(keyFor(task.project_id), task.id)} marked as done` });
    } catch (err) {
      upsertTask(task);
      toast({ tone: "error", title: "Couldn't move task", body: err instanceof ApiError ? err.detail : undefined });
    }
  };

  const onDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    setOverCol(null);
    const id = Number(event.dataTransfer.getData("text/task")) || dragId;
    const task = tasks.find((t) => t.id === id);
    setDragId(null);
    if (task) void move(task, status);
  };

  return (
    <div className="page board-page">
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input placeholder="Filter tasks…" value={query} onChange={(e) => setParam("q", e.target.value || null)} />
          {query && (
            <button type="button" onClick={() => setParam("q", null)} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <button type="button" className={`chip ${mine ? "on" : ""}`} onClick={() => setParam("mine", mine ? null : "1")}>
          My tasks
        </button>
        <button
          type="button"
          className={`chip ${dueFilter === "overdue" ? "on danger" : ""}`}
          onClick={() => setParam("due", dueFilter === "overdue" ? null : "overdue")}
        >
          Overdue
        </button>

        <select className="select-chip" value={projectFilter ?? ""} onChange={(e) => setParam("project", e.target.value || null)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select className="select-chip" value={assignee ?? ""} onChange={(e) => setParam("assignee", e.target.value || null)}>
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <select className="select-chip" value={priority ?? ""} onChange={(e) => setParam("priority", e.target.value || null)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {activeFilters > 0 && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setParams(view === "list" ? { view: "list" } : {}, { replace: true })}
          >
            <SlidersHorizontal size={14} /> Clear {activeFilters}
          </button>
        )}

        <span className="spacer" />
        <span className="muted small">{filtered.length} tasks</span>
        <div className="segmented" role="tablist">
          <button type="button" className={view === "board" ? "on" : ""} onClick={() => setParam("view", null)} title="Board view">
            <LayoutGrid size={15} />
          </button>
          <button type="button" className={view === "list" ? "on" : ""} onClick={() => setParam("view", "list")} title="List view">
            <List size={15} />
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="kanban">
          {STATUSES.map((s) => (
            <div className="column" key={s}>
              <div className="skeleton" style={{ height: 96 }} />
              <div className="skeleton" style={{ height: 96 }} />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <h3>No projects yet</h3>
          <p className="muted">Create a project to start adding tasks to the board.</p>
          {can.edit && (
            <button className="btn primary" type="button" onClick={() => navigate("/projects?new=1")}>
              <Plus size={16} /> Create project
            </button>
          )}
        </div>
      ) : view === "board" ? (
        <div className="kanban">
          {STATUSES.map((status) => {
            const column = filtered.filter((t) => t.status === status);
            return (
              <section
                key={status}
                className={`column ${overCol === status ? "drop" : ""}`}
                onDragOver={(e) => {
                  if (!can.edit) return;
                  e.preventDefault();
                  setOverCol(status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
                }}
                onDrop={(e) => onDrop(e, status)}
              >
                <header className="column-head">
                  <StatusIcon status={status} />
                  <h3>{STATUS_LABEL[status]}</h3>
                  <span className="count">{column.length}</span>
                  {can.edit && (
                    <button
                      className="icon-btn sm"
                      type="button"
                      title={`Add to ${STATUS_LABEL[status]}`}
                      onClick={() => compose({ status, projectId: projectFilter ?? undefined })}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </header>
                <div className="column-body">
                  {column.map((task) => (
                    <article
                      key={task.id}
                      className={`card-task ${dragId === task.id ? "dragging" : ""} p-${task.priority}`}
                      draggable={can.edit}
                      tabIndex={0}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/task", String(task.id));
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(task.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onClick={() => openTask(task.id)}
                      onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
                    >
                      <div className="ct-top">
                        <span className="ct-ref">{taskRef(keyFor(task.project_id), task.id)}</span>
                        <PriorityIcon priority={task.priority} />
                      </div>
                      <h4>{task.title}</h4>
                      <div className="ct-foot">
                        <DueChip task={task} compact />
                        {task.comment_count > 0 && (
                          <span className="ct-meta">
                            <MessageSquare size={12} /> {task.comment_count}
                          </span>
                        )}
                        <span className="spacer" />
                        <AvatarStack members={members.filter((m) => task.assignee_ids.includes(m.user_id))} size={22} />
                      </div>
                    </article>
                  ))}
                  {column.length === 0 && (
                    <div className="column-empty">{can.edit ? "Drop tasks here" : "Nothing here"}</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignees</th>
                <th>Due</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} onClick={() => openTask(task.id)}>
                  <td>
                    <span className="ct-ref">{taskRef(keyFor(task.project_id), task.id)}</span>
                    <span className="td-title">{task.title}</span>
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td>
                    <AvatarStack members={members.filter((m) => task.assignee_ids.includes(m.user_id))} size={22} />
                  </td>
                  <td>
                    <DueChip task={task} />
                  </td>
                  <td className="muted">{formatDate(task.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="table-empty">No tasks match these filters.</p>}
        </div>
      )}
    </div>
  );
}
