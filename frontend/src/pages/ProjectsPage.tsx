import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Project } from "../api/types";
import { AvatarStack } from "../components/Avatar";
import { MenuItem, Popover } from "../components/Menu";
import { ConfirmModal, Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useOrg } from "../context/OrgContext";
import { STATUSES, STATUS_LABEL, colorFor, formatDate } from "../lib/format";

function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((w) => w[0]).join("").slice(0, 5);
}

export function ProjectsPage() {
  const { org, projects, tasks, members, can, reloadProjects, reloadTasks } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1" && can.edit) {
      setEditing("new");
      setParams({}, { replace: true });
    }
  }, [params, setParams, can.edit]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Projects</h2>
          <p className="muted">
            {projects.length} project{projects.length === 1 ? "" : "s"} in {org?.name}
          </p>
        </div>
        {can.edit && (
          <button className="btn primary" type="button" onClick={() => setEditing("new")}>
            <Plus size={16} /> New project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="onb-art">
            <FolderKanban size={30} />
          </div>
          <h3>Start your first project</h3>
          <p className="muted">Projects group related tasks — a product area, a client, or a launch.</p>
          {can.edit && (
            <button className="btn primary" type="button" onClick={() => setEditing("new")}>
              <Plus size={16} /> Create project
            </button>
          )}
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => {
            const ptasks = tasks.filter((t) => t.project_id === project.id);
            const done = ptasks.filter((t) => t.status === "done").length;
            const pct = ptasks.length ? Math.round((done / ptasks.length) * 100) : 0;
            const people = members.filter((m) => ptasks.some((t) => t.assignee_ids.includes(m.user_id)));
            return (
              <article
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/board?project=${project.id}`)}
                style={{ ["--accent" as string]: colorFor(project.key) }}
              >
                <header>
                  <span className="project-key">{project.key}</span>
                  {can.edit && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Popover
                        align="right"
                        trigger={({ toggle }) => (
                          <button className="icon-btn sm" type="button" onClick={toggle} aria-label="Project actions">
                            <MoreHorizontal size={16} />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            <MenuItem
                              icon={<Pencil size={14} />}
                              onClick={() => {
                                close();
                                setEditing(project);
                              }}
                            >
                              Edit details
                            </MenuItem>
                            {can.deleteProjects && (
                              <MenuItem
                                danger
                                icon={<Trash2 size={14} />}
                                onClick={() => {
                                  close();
                                  setDeleting(project);
                                }}
                              >
                                Delete project
                              </MenuItem>
                            )}
                          </>
                        )}
                      </Popover>
                    </div>
                  )}
                </header>
                <h3>{project.name}</h3>
                <p className="project-desc">{project.description || "No description yet."}</p>

                <div className="status-strip" title={`${done} of ${ptasks.length} done`}>
                  {STATUSES.map((s) => {
                    const n = ptasks.filter((t) => t.status === s).length;
                    return n ? <span key={s} className={`seg s-${s}`} style={{ flex: n }} title={`${STATUS_LABEL[s]}: ${n}`} /> : null;
                  })}
                  {ptasks.length === 0 && <span className="seg empty" style={{ flex: 1 }} />}
                </div>
                <footer>
                  <span className="muted small">
                    <strong>{pct}%</strong> complete · {ptasks.length} task{ptasks.length === 1 ? "" : "s"}
                  </span>
                  <AvatarStack members={people} size={22} />
                </footer>
                <span className="project-date">Created {formatDate(project.created_at, true)}</span>
              </article>
            );
          })}
        </div>
      )}

      {editing && org && (
        <ProjectModal
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === "new") {
              const created = await api.createProject(org.id, values);
              toast({ tone: "success", title: "Project created", body: `${created.key} · ${created.name}` });
            } else {
              await api.updateProject(org.id, editing.id, { name: values.name, description: values.description || null });
              toast({ tone: "success", title: "Project updated" });
            }
            await reloadProjects();
            setEditing(null);
          }}
        />
      )}

      {deleting && org && (
        <ConfirmModal
          title={`Delete ${deleting.key}?`}
          body={
            <>
              <strong>{deleting.name}</strong> and its {tasks.filter((t) => t.project_id === deleting.id).length} task(s)
              will be permanently deleted. This can't be undone.
            </>
          }
          confirmLabel="Delete project"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteProject(org.id, deleting.id);
              await Promise.all([reloadProjects(), reloadTasks()]);
              toast({ tone: "success", title: "Project deleted", body: deleting.name });
              setDeleting(null);
            } catch (err) {
              toast({ tone: "error", title: "Delete failed", body: err instanceof ApiError ? err.detail : undefined });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function ProjectModal({
  project,
  onClose,
  onSave,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (values: { name: string; key: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(project));
  const [description, setDescription] = useState(project?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveKey = keyTouched ? key : suggestKey(name);

  return (
    <Modal
      title={project ? "Edit project" : "New project"}
      subtitle={project ? undefined : "Projects group related work under a short key."}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit" form="project-form" disabled={busy || !name.trim() || effectiveKey.length < 2}>
            {busy ? "Saving…" : project ? "Save changes" : "Create project"}
          </button>
        </>
      }
    >
      <form
        id="project-form"
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({ name: name.trim(), key: effectiveKey, description: description.trim() });
          } catch (err) {
            setError(err instanceof ApiError ? err.detail : "Could not save project");
            setBusy(false);
          }
        }}
      >
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name} autoFocus required maxLength={160} placeholder="Customer Portal" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">
            Key <span className="field-hint">2–12 letters or numbers · used in task IDs</span>
          </span>
          <input
            className="mono"
            value={effectiveKey}
            disabled={Boolean(project)}
            required
            maxLength={12}
            placeholder="WEB"
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea value={description} rows={3} placeholder="What is this project about?" onChange={(e) => setDescription(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
