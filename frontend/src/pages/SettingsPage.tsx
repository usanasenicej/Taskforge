import { Database, KeyRound, Monitor, Moon, Plus, RefreshCw, Server, ShieldCheck, ShieldOff, Sun, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Health, TwoFactorStatus } from "../api/types";
import { Avatar } from "../components/Avatar";
import { RoleBadge } from "../components/Badges";
import { useToast } from "../components/Toast";
import { DisableTwoFactorModal, EnableTwoFactorModal } from "../components/TwoFactorSetup";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { colorFor, formatDate, initials } from "../lib/format";
import { useTheme, type ThemePref } from "../lib/theme";

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { org, orgs, role, stream, switchOrg, reloadOrgs } = useOrg();
  const theme = useTheme();
  const toast = useToast();
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [tfa, setTfa] = useState<TwoFactorStatus | null>(null);
  const [tfaModal, setTfaModal] = useState<"enable" | "disable" | null>(null);

  const loadTfa = useCallback(async () => {
    setTfa(await api.twoFactorStatus());
  }, []);

  useEffect(() => {
    void loadTfa().catch(() => undefined);
  }, [loadTfa]);

  const loadHealth = useCallback(async () => {
    setHealth(undefined);
    setHealth(await api.health());
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="muted">Your profile, appearance and workspaces.</p>
        </div>
      </div>

      <section className="settings-card">
        <h3>Profile</h3>
        <div className="profile">
          <Avatar name={user?.full_name ?? "User"} size={56} />
          <div>
            <strong>{user?.full_name}</strong>
            <span className="muted">{user?.email}</span>
            <span className="muted small">Member since {formatDate(user?.created_at, true)}</span>
          </div>
          <RoleBadge role={role} />
        </div>
      </section>

      <section className="settings-card" id="security">
        <h3>Security</h3>
        <div className="security-row">
          <span className={`security-icon ${tfa?.enabled ? "on" : ""}`}>
            {tfa?.enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
          </span>
          <div className="security-text">
            <strong>
              Two-factor authentication
              {tfa && <span className={`pill ${tfa.enabled ? "pill-on" : "pill-off"}`}>{tfa.enabled ? "On" : "Off"}</span>}
            </strong>
            <span className="muted small">
              {tfa?.enabled ? (
                <>
                  <KeyRound size={13} /> Codes from your authenticator app are required at sign-in ·{" "}
                  {tfa.recovery_codes_left} recovery code{tfa.recovery_codes_left === 1 ? "" : "s"} left
                </>
              ) : (
                "Require a code from your phone in addition to your password."
              )}
            </span>
          </div>
          {tfa &&
            (tfa.enabled ? (
              <button className="btn ghost" type="button" onClick={() => setTfaModal("disable")}>
                Turn off
              </button>
            ) : (
              <button className="btn primary" type="button" onClick={() => setTfaModal("enable")}>
                Turn on
              </button>
            ))}
        </div>
      </section>

      <section className="settings-card">
        <h3>Appearance</h3>
        <div className="theme-options">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className={`theme-option ${theme.pref === value ? "on" : ""}`} onClick={() => theme.set(value)}>
              <span className={`theme-preview tp-${value}`}>
                <i />
                <i />
              </span>
              <span>
                <Icon size={14} /> {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card" id="workspaces">
        <h3>Workspaces</h3>
        <ul className="org-list">
          {orgs.map((item) => (
            <li key={item.id} className={item.id === org?.id ? "on" : ""}>
              <span className="org-avatar" style={{ background: colorFor(item.slug) }}>
                {initials(item.name)}
              </span>
              <div>
                <strong>{item.name}</strong>
                <span className="muted small">/{item.slug}</span>
              </div>
              {item.id === org?.id ? (
                <span className="pill">Current</span>
              ) : (
                <button className="btn ghost sm" type="button" onClick={() => switchOrg(item.id)}>
                  Switch
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!orgName.trim()) return;
            setCreating(true);
            try {
              const created = await api.createOrg(orgName.trim());
              await reloadOrgs();
              switchOrg(created.id);
              setOrgName("");
              toast({ tone: "success", title: "Workspace created", body: `You're the owner of ${created.name}` });
            } catch (err) {
              toast({ tone: "error", title: "Couldn't create workspace", body: err instanceof ApiError ? err.detail : undefined });
            } finally {
              setCreating(false);
            }
          }}
        >
          <input placeholder="New workspace name" value={orgName} maxLength={120} onChange={(e) => setOrgName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={creating || !orgName.trim()}>
            <Plus size={15} /> Create
          </button>
        </form>
      </section>

      <section className="settings-card">
        <div className="card-head">
          <h3>System status</h3>
          <button className="btn ghost sm" type="button" onClick={loadHealth}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="status-grid">
          <StatusTile
            icon={<Server size={18} />}
            label="API"
            ok={health ? true : health === null ? false : undefined}
            detail={health === null ? "Unreachable" : "FastAPI · healthy"}
          />
          <StatusTile
            icon={<Database size={18} />}
            label="Database"
            ok={health?.checks.database}
            detail={health ? health.database_backend : "…"}
          />
          <StatusTile
            icon={<Zap size={18} />}
            label="Redis"
            ok={health ? health.checks.redis && health.redis_backend === "redis" : undefined}
            detail={
              health
                ? health.redis_backend === "redis"
                  ? "Connected · cache, queue, pub/sub"
                  : "Not running · in-memory fallback"
                : "…"
            }
          />
          <StatusTile
            icon={<RefreshCw size={18} />}
            label="Live updates"
            ok={stream === "live" ? true : stream === "offline" ? false : undefined}
            detail={stream === "live" ? "SSE stream connected" : stream === "offline" ? "Reconnecting…" : "Connecting…"}
          />
        </div>
      </section>

      {tfaModal === "enable" && (
        <EnableTwoFactorModal
          onClose={() => setTfaModal(null)}
          onEnabled={() => {
            void loadTfa();
            void refreshUser();
            toast({ tone: "success", title: "Two-factor authentication is on" });
          }}
        />
      )}
      {tfaModal === "disable" && (
        <DisableTwoFactorModal
          onClose={() => setTfaModal(null)}
          onDisabled={() => {
            void loadTfa();
            void refreshUser();
            toast({ tone: "success", title: "Two-factor authentication is off" });
          }}
        />
      )}
    </div>
  );
}

function StatusTile({ icon, label, ok, detail }: { icon: React.ReactNode; label: string; ok?: boolean; detail: string }) {
  const state = ok === undefined ? "pending" : ok ? "ok" : "bad";
  return (
    <div className={`status-tile ${state}`}>
      <span className="status-tile-icon">{icon}</span>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <span className="status-light" />
    </div>
  );
}
