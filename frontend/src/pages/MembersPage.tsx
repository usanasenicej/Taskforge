import { Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { Member, OrgRole } from "../api/types";
import { Avatar } from "../components/Avatar";
import { RoleBadge } from "../components/Badges";
import { ConfirmModal, Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { ROLES, ROLE_INFO, formatDate } from "../lib/format";

/** Mirrors app/core/permissions.can_manage_role on the server. */
function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "owner") return ROLES;
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

export function MembersPage() {
  const { user } = useAuth();
  const { org, members, tasks, role, can, reloadMembers } = useOrg();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = members.filter((m) => `${m.full_name} ${m.email}`.toLowerCase().includes(query.toLowerCase()));
  const counts = ROLES.map((r) => ({ role: r, n: members.filter((m) => m.role === r).length }));

  const canEditMember = (m: Member) =>
    can.manageMembers && m.user_id !== user?.id && (m.role !== "owner" || role === "owner");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Members</h2>
          <p className="muted">
            {members.length} people in {org?.name}
          </p>
        </div>
        {can.manageMembers && (
          <button className="btn primary" type="button" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Add member
          </button>
        )}
      </div>

      <div className="role-summary">
        {counts.map(({ role: r, n }) => (
          <div key={r} className={`role-tile r-${r}`}>
            <RoleBadge role={r} />
            <strong>{n}</strong>
            <p>{ROLE_INFO[r].blurb}</p>
          </div>
        ))}
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={15} />
            <input placeholder="Search members…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {!can.manageMembers && (
            <span className="muted small">
              <ShieldCheck size={14} /> Only owners and admins can change membership
            </span>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Open tasks</th>
              <th>Joined</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const open = tasks.filter((t) => t.status !== "done" && t.assignee_ids.includes(m.user_id)).length;
              return (
                <tr key={m.user_id} className="static">
                  <td>
                    <div className="member-cell">
                      <Avatar name={m.full_name} size={34} />
                      <div>
                        <strong>
                          {m.full_name}
                          {m.user_id === user?.id && <span className="you">You</span>}
                        </strong>
                        <span className="muted small">{m.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canEditMember(m) ? (
                      <select
                        className="select-chip"
                        value={m.role}
                        onChange={async (e) => {
                          if (!org) return;
                          const next = e.target.value as OrgRole;
                          try {
                            await api.updateMemberRole(org.id, m.user_id, next);
                            await reloadMembers();
                            toast({ tone: "success", title: "Role updated", body: `${m.full_name} is now ${ROLE_INFO[next].label}` });
                          } catch (err) {
                            toast({ tone: "error", title: "Couldn't change role", body: err instanceof ApiError ? err.detail : undefined });
                          }
                        }}
                      >
                        {assignableRoles(role).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_INFO[r].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </td>
                  <td>{open}</td>
                  <td className="muted">{formatDate(m.created_at, true)}</td>
                  <td className="row-end">
                    {canEditMember(m) && m.role !== "owner" && (
                      <button className="icon-btn danger" type="button" title="Remove from workspace" onClick={() => setRemoving(m)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="table-empty">No members match “{query}”.</p>}
      </div>

      {inviting && org && (
        <InviteModal
          actorRole={role}
          onClose={() => setInviting(false)}
          onInvite={async (payload) => {
            const member = await api.inviteMember(org.id, payload);
            await reloadMembers();
            toast({ tone: "success", title: "Member added", body: `${member.full_name} joined as ${ROLE_INFO[member.role].label}` });
            setInviting(false);
          }}
        />
      )}

      {removing && org && (
        <ConfirmModal
          title="Remove member?"
          body={
            <>
              <strong>{removing.full_name}</strong> will lose access to {org.name}. Their tasks and comments stay.
            </>
          }
          confirmLabel="Remove"
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.removeMember(org.id, removing.user_id);
              await reloadMembers();
              toast({ tone: "success", title: "Member removed", body: removing.full_name });
              setRemoving(null);
            } catch (err) {
              toast({ tone: "error", title: "Couldn't remove", body: err instanceof ApiError ? err.detail : undefined });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function InviteModal({
  actorRole,
  onClose,
  onInvite,
}: {
  actorRole: OrgRole;
  onClose: () => void;
  onInvite: (payload: { email: string; full_name: string; password?: string; role: OrgRole }) => Promise<void>;
}) {
  const roles = assignableRoles(actorRole);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Add a member"
      subtitle="Existing TaskForge users are added straight away. New users get an account with the password you set."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit" form="invite-form" disabled={busy}>
            {busy ? "Adding…" : "Add member"}
          </button>
        </>
      }
    >
      <form
        id="invite-form"
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onInvite({ email: email.trim(), full_name: name.trim(), password: password || undefined, role: memberRole });
          } catch (err) {
            setError(err instanceof ApiError ? err.detail : "Could not add member");
            setBusy(false);
          }
        }}
      >
        {error && <div className="alert error">{error}</div>}
        <div className="form-row">
          <label className="field">
            <span className="field-label">Full name</span>
            <input value={name} required autoFocus maxLength={120} placeholder="Jordan Lee" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" value={email} required placeholder="jordan@company.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">
            Temporary password <span className="field-hint">Required only for people new to TaskForge</span>
          </span>
          <input type="text" value={password} minLength={8} placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Role</span>
          <div className="role-options">
            {roles.map((r) => (
              <label key={r} className={`role-option ${memberRole === r ? "on" : ""}`}>
                <input type="radio" name="role" checked={memberRole === r} onChange={() => setMemberRole(r)} />
                <RoleBadge role={r} />
                <span>{ROLE_INFO[r].blurb}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
