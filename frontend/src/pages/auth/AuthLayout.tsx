import { Bell, CheckCircle2, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "../../components/Logo";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-form-side">
        <header className="auth-top">
          <Logo />
        </header>
        <div className="auth-form-wrap">{children}</div>
        <footer className="auth-foot">© {new Date().getFullYear()} TaskForge · Multi-tenant work management</footer>
      </section>

      <section className="auth-showcase" aria-hidden>
        <div className="showcase-glow g1" />
        <div className="showcase-glow g2" />
        <div className="showcase-grid" />
        <div className="showcase-content">
          <span className="showcase-eyebrow">
            <Zap size={14} /> Real-time by default
          </span>
          <h2>Ship work, not status updates.</h2>
          <p>
            Projects, tasks and teammates in one calm workspace. Every change streams to your whole team the moment it
            happens.
          </p>

          <div className="mock">
            <div className="mock-card c1">
              <div className="mock-row">
                <span className="mock-key">PLAT-12</span>
                <span className="mock-prio urgent" />
              </div>
              <strong>Rotate JWT refresh tokens</strong>
              <div className="mock-row">
                <span className="mock-status progress">In progress</span>
                <span className="mock-avatars">
                  <i style={{ background: "#6366f1" }}>AO</i>
                  <i style={{ background: "#ec4899" }}>MM</i>
                </span>
              </div>
              <div className="mock-progress">
                <span />
              </div>
            </div>

            <div className="mock-card c2">
              <div className="mock-row">
                <span className="mock-key">WEB-7</span>
                <span className="mock-status done">
                  <CheckCircle2 size={12} /> Done
                </span>
              </div>
              <strong>Kanban drag &amp; drop</strong>
            </div>

            <div className="mock-toast">
              <span className="mock-toast-icon">
                <Bell size={14} />
              </span>
              <div>
                <strong>Casey assigned you a task</strong>
                <span>Configure overdue reminders</span>
              </div>
            </div>
          </div>

          <ul className="showcase-points">
            <li>
              <CheckCircle2 size={16} /> Roles &amp; permissions per workspace
            </li>
            <li>
              <CheckCircle2 size={16} /> Background reminders &amp; notifications
            </li>
            <li>
              <CheckCircle2 size={16} /> Live board updates across every tab
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
