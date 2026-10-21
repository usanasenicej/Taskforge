import { Check, Link2, MessageSquare, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, type TaskInput } from "../api/client";
import type { Comment, Task, TaskPriority, TaskStatus } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { useOrg, useOrgEvents } from "../context/OrgContext";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  dateInputToIso,
  formatDateTime,
  isoToDateInput,
  memberById,
  taskRef,
  timeAgo,
} from "../lib/format";
import { AssigneePicker } from "./AssigneePicker";
import { Avatar } from "./Avatar";
import { DueChip, PriorityIcon, StatusIcon } from "./Badges";
import { ConfirmModal } from "./Modal";
import { useToast } from "./Toast";

export function TaskDrawerHost() {
  const [params, setParams] = useSearchParams();
  const taskId = Number(params.get("task")) || null;
  const close = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("task");
        return next;
      },
      { replace: true },
    );
  }, [setParams]);
  if (!taskId) return null;
  return <TaskDrawer key={taskId} taskId={taskId} onClose={close} />;
}

function TaskDrawer({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { org, tasks, members, projects, can, upsertTask, removeTask } = useOrg();
  const { user } = useAuth();
  const toast = useToast();
  const cached = tasks.find((t) => t.id === taskId);
  const [task, setTask] = useState<Task | null>(cached ?? null);
  const [missing, setMissing] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  // Keep in sync with live updates that land in the shared task list.
  useEffect(() => {
    if (cached) setTask(cached);
  }, [cached]);

  useEffect(() => {
    if (!org) return;
    api
      .getTask(org.id, taskId)
      .then(setTask)
      .catch(() => setMissing(true));
    api.comments(org.id, taskId).then(setComments).catch(() => setComments([]));
  }, [org, taskId]);

  useOrgEvents((event) => {
    if (event.type === "comment.created" && event.payload.task_id === taskId && org) {
      void api.comments(org.id, taskId).then(setComments);
    }
    if (event.type === "task.deleted" && event.payload.id === taskId) setMissing(true);
  });

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [comments?.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector(".overlay")) return;
      if (event.target instanceof HTMLTextAreaElement) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (patch: Partial<TaskInput>) => {
    if (!org || !task) return;
    const previous = task;
    setTask({ ...task, ...(patch as Partial<Task>) });
    try {
      const updated = await api.updateTask(org.id, task.id, patch);
      setTask(updated);
      upsertTask(updated);
    } catch (err) {
      setTask(previous);
      toast({ tone: "error", title: "Couldn't save", body: err instanceof ApiError ? err.detail : undefined });
    }
  };

  const postComment = async () => {
    if (!org || !task || !draft.trim()) return;
    setPosting(true);
    try {
      const comment = await api.addComment(org.id, task.id, draft.trim());
      setComments((current) => (current?.some((c) => c.id === comment.id) ? current : [...(current ?? []), comment]));
      setDraft("");
    } catch (err) {
      toast({ tone: "error", title: "Comment not posted", body: err instanceof ApiError ? err.detail : undefined });
    } finally {
      setPosting(false);
    }
  };

  const project = projects.find((p) => p.id === task?.project_id);
  const creator = memberById(members, task?.created_by);
  const ref = task ? taskRef(project?.key, task.id) : "";
  const readOnly = !can.edit;

  return createPortal(
    <div className="drawer-overlay" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()} aria-label="Task details">
        <header className="drawer-head">
          <span className="drawer-ref">
            {project && <span className="key-chip">{project.key}</span>}
            {ref}
          </span>
          <div className="drawer-actions">
            <button
              className="icon-btn"
              type="button"
              title="Copy link"
              onClick={() => {
                void navigator.clipboard?.writeText(`${window.location.origin}/board?task=${taskId}`);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={16} /> : <Link2 size={16} />}
            </button>
            {can.edit && task && (
              <button className="icon-btn danger" type="button" title="Delete task" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
              </button>
            )}
            <button className="icon-btn" type="button" title="Close (Esc)" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {missing && !task ? (
          <div className="drawer-empty">
            <h3>Task not found</h3>
            <p className="muted">It may have been deleted, or it belongs to another workspace.</p>
          </div>
        ) : !task ? (
          <div className="drawer-body">
            <div className="skeleton" style={{ height: 34, width: "70%" }} />
            <div className="skeleton" style={{ height: 90, marginTop: 18 }} />
          </div>
        ) : (
          <div className="drawer-body">
            {missing && <div className="alert warn">This task was just deleted by someone else.</div>}
            <EditableTitle value={task.title} disabled={readOnly} onSave={(title) => save({ title })} />

            <div className="props-grid">
              <span className="prop-label">Status</span>
              <div className={`select-wrap s-${task.status}`}>
                <StatusIcon status={task.status} />
                <select
                  value={task.status}
                  disabled={readOnly}
                  onChange={(e) => save({ status: e.target.value as TaskStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <span className="prop-label">Priority</span>
              <div className="select-wrap">
                <PriorityIcon priority={task.priority} />
                <select
                  value={task.priority}
                  disabled={readOnly}
                  onChange={(e) => save({ priority: e.target.value as TaskPriority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>

              <span className="prop-label">Assignees</span>
              <AssigneePicker
                members={members}
                value={task.assignee_ids}
                disabled={readOnly}
                onChange={(ids) => save({ assignee_ids: ids })}
              />

              <span className="prop-label">Due date</span>
              <div className="due-edit">
                <input
                  type="date"
                  value={isoToDateInput(task.due_date)}
                  disabled={readOnly}
                  onChange={(e) => save({ due_date: dateInputToIso(e.target.value) })}
                />
                <DueChip task={task} compact />
              </div>

              <span className="prop-label">Project</span>
              <span className="prop-value">{project ? `${project.key} · ${project.name}` : "—"}</span>

              <span className="prop-label">Created</span>
              <span className="prop-value">
                {creator && <Avatar name={creator.full_name} size={18} />}
                {creator?.full_name ?? "Unknown"} · {formatDateTime(task.created_at)}
              </span>
            </div>

            <EditableDescription
              value={task.description ?? ""}
              disabled={readOnly}
              onSave={(description) => save({ description: description || null })}
            />

            <section className="thread">
              <h3>
                <MessageSquare size={16} /> Comments
                <span className="count">{comments?.length ?? task.comment_count}</span>
              </h3>
              {comments === null ? (
                <div className="skeleton" style={{ height: 48 }} />
              ) : comments.length === 0 ? (
                <p className="muted small">No comments yet. Start the conversation.</p>
              ) : (
                <ul className="comments">
                  {comments.map((comment) => {
                    const author = memberById(members, comment.user_id);
                    const name = author?.full_name ?? "Former member";
                    return (
                      <li key={comment.id} className={comment.user_id === user?.id ? "mine" : ""}>
                        <Avatar name={name} size={30} />
                        <div className="comment-bubble">
                          <div className="comment-meta">
                            <strong>{name}</strong>
                            <time title={formatDateTime(comment.created_at)}>{timeAgo(comment.created_at)}</time>
                          </div>
                          <p>{comment.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div ref={threadEnd} />
            </section>
          </div>
        )}

        {task && can.edit && (
          <footer className="composer-bar">
            <Avatar name={user?.full_name ?? "You"} size={30} />
            <textarea
              placeholder="Write a comment…  (Ctrl+Enter to send)"
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void postComment();
              }}
            />
            <button className="btn primary icon-only" type="button" disabled={!draft.trim() || posting} onClick={postComment}>
              <Send size={16} />
            </button>
          </footer>
        )}
        {task && !can.edit && <footer className="composer-bar readonly">You have view-only access to this workspace.</footer>}
      </aside>

      {confirmDelete && task && (
        <ConfirmModal
          title="Delete this task?"
          body={
            <>
              <strong>{ref}</strong> “{task.title}” and its comments will be permanently removed.
            </>
          }
          busy={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            if (!org) return;
            setDeleting(true);
            try {
              await api.deleteTask(org.id, task.id);
              removeTask(task.id);
              toast({ tone: "success", title: "Task deleted", body: ref });
              onClose();
            } catch (err) {
              toast({ tone: "error", title: "Delete failed", body: err instanceof ApiError ? err.detail : undefined });
              setDeleting(false);
            }
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function EditableTitle({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const next = text.trim();
    if (next && next !== value) onSave(next);
    else setText(value);
  };
  return (
    <textarea
      className="title-edit"
      value={text}
      disabled={disabled}
      rows={1}
      maxLength={255}
      onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

function EditableDescription({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  if (!editing) {
    return (
      <section className="desc">
        <h3>Description</h3>
        <div
          className={`desc-view ${value ? "" : "empty"} ${disabled ? "" : "editable"}`}
          onClick={() => !disabled && setEditing(true)}
        >
          {value || (disabled ? "No description." : "Add more detail…")}
        </div>
      </section>
    );
  }
  return (
    <section className="desc">
      <h3>Description</h3>
      <textarea className="desc-edit" value={text} autoFocus rows={6} onChange={(e) => setText(e.target.value)} />
      <div className="row end">
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => {
            setText(value);
            setEditing(false);
          }}
        >
          Cancel
        </button>
        <button
          className="btn primary sm"
          type="button"
          onClick={() => {
            if (text.trim() !== value) onSave(text.trim());
            setEditing(false);
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}
