import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { TaskPriority, TaskStatus } from "../api/types";
import { useOrg } from "../context/OrgContext";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, dateInputToIso } from "../lib/format";
import { AssigneePicker } from "./AssigneePicker";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

interface ComposerDefaults {
  projectId?: number;
  status?: TaskStatus;
}

const ComposerContext = createContext<((defaults?: ComposerDefaults) => void) | null>(null);

export function TaskComposerProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaults] = useState<ComposerDefaults | null>(null);
  const open = useCallback((next: ComposerDefaults = {}) => setDefaults(next), []);
  return (
    <ComposerContext.Provider value={open}>
      {children}
      {defaults && <ComposerModal defaults={defaults} onClose={() => setDefaults(null)} />}
    </ComposerContext.Provider>
  );
}

export function useTaskComposer() {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useTaskComposer must be used within TaskComposerProvider");
  return ctx;
}

function ComposerModal({ defaults, onClose }: { defaults: ComposerDefaults; onClose: () => void }) {
  const { org, projects, members, upsertTask } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | "">(defaults.projectId ?? projects[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [due, setDue] = useState("");
  const [assignees, setAssignees] = useState<number[]>([]);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!org) return null;

  if (projects.length === 0) {
    return (
      <Modal title="Create a project first" onClose={onClose} width={420}>
        <p className="muted">Tasks live inside projects. Create your first project, then add tasks to it.</p>
        <button
          className="btn primary block"
          type="button"
          onClick={() => {
            onClose();
            navigate("/projects?new=1");
          }}
        >
          Create a project
        </button>
      </Modal>
    );
  }

  const submit = async () => {
    if (!title.trim() || projectId === "") return;
    setBusy(true);
    setError("");
    try {
      const task = await api.createTask(org.id, projectId, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dateInputToIso(due),
        assignee_ids: assignees,
      });
      upsertTask(task);
      const key = projects.find((p) => p.id === projectId)?.key;
      toast({
        tone: "success",
        title: "Task created",
        body: `${key}-${task.id} · ${task.title}`,
        action: { label: "Open", onClick: () => navigate(`?task=${task.id}`) },
      });
      if (another) {
        setTitle("");
        setDescription("");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New task"
      onClose={onClose}
      width={620}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} />
            Create another
          </label>
          <span className="spacer" />
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? "Creating…" : "Create task"}
            <kbd>Ctrl ↵</kbd>
          </button>
        </>
      }
    >
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
        }}
      >
        {error && <div className="alert error">{error}</div>}
        <input
          className="composer-title"
          placeholder="Task title"
          value={title}
          autoFocus
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="composer-desc"
          placeholder="Add a description…"
          value={description}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="composer-props">
          <label className="prop">
            <span>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="prop">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="prop">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="prop">
            <span>Due date</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <div className="prop">
            <span>Assignees</span>
            <AssigneePicker members={members} value={assignees} onChange={setAssignees} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
