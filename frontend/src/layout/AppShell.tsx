import {
  Check,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { RoleBadge } from "../components/Badges";
import { CommandPalette } from "../components/CommandPalette";
import { LogoMark } from "../components/Logo";
import { MenuItem, Popover } from "../components/Menu";
import { NotificationBell } from "../components/NotificationBell";
import { TaskComposerProvider, useTaskComposer } from "../components/TaskComposer";
import { TaskDrawerHost } from "../components/TaskDrawer";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { colorFor, initials } from "../lib/format";
import { useTheme } from "../lib/theme";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/board", label: "Board", icon: SquareKanban },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/members", label: "Members", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/board": "Board",
  "/projects": "Projects",
  "/members": "Members",
  "/settings": "Settings",
};

export function AppShell() {
  return (
    <TaskComposerProvider>
      <Shell />
    </TaskComposerProvider>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { org, orgs, switchOrg, role, stream, tasks, can } = useOrg();
  const compose = useTaskComposer();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("tf_sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [palette, setPalette] = useState(false);
  const pendingG = useRef(false);

  const myOpen = tasks.filter((t) => t.status !== "done" && t.assignee_ids.includes(user?.id ?? -1)).length;

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem("tf_sidebar", collapsed ? "collapsed" : "open");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((v) => !v);
        return;
      }
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (typing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector(".overlay")) return;
      const key = event.key.toLowerCase();
      if (pendingG.current) {
        pendingG.current = false;
        const dest = { d: "/", b: "/board", p: "/projects", m: "/members", s: "/settings" }[key];
        if (dest) navigate(dest);
        return;
      }
      if (key === "g") {
        pendingG.current = true;
        window.setTimeout(() => (pendingG.current = false), 900);
      } else if (key === "c" && can.edit) {
        event.preventDefault();
        compose();
      } else if (key === "/") {
        event.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, compose, can.edit]);

  const streamLabel = { live: "Live", connecting: "Connecting", offline: "Reconnecting" }[stream];

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Popover
          className="org-menu"
          trigger={({ toggle }) => (
            <button type="button" className="org-switcher" onClick={toggle} title={org?.name}>
              <span className="org-avatar" style={{ background: colorFor(org?.slug ?? "x") }}>
                {initials(org?.name ?? "T")}
              </span>
              <span className="org-text">
                <strong>{org?.name ?? "No workspace"}</strong>
                <small>{orgs.length} workspace{orgs.length === 1 ? "" : "s"}</small>
              </span>
              <ChevronsUpDown size={15} className="org-chevron" />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="menu-title">Workspaces</div>
              {orgs.map((item) => (
                <MenuItem
                  key={item.id}
                  active={item.id === org?.id}
                  icon={
                    <span className="org-avatar xs" style={{ background: colorFor(item.slug) }}>
                      {initials(item.name)}
                    </span>
                  }
                  hint={item.id === org?.id ? <Check size={14} /> : undefined}
                  onClick={() => {
                    switchOrg(item.id);
                    close();
                  }}
                >
                  {item.name}
                </MenuItem>
              ))}
              <div className="menu-sep" />
              <MenuItem
                icon={<Plus size={15} />}
                onClick={() => {
                  close();
                  navigate("/settings#workspaces");
                }}
              >
                Create workspace
              </MenuItem>
            </>
          )}
        </Popover>

        {can.edit && (
          <button className="btn primary new-task" type="button" onClick={() => compose()}>
            <Plus size={16} />
            <span>New task</span>
            <kbd>C</kbd>
          </button>
        )}

        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.to === "/board" && myOpen > 0 && <span className="nav-count">{myOpen}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-foot">
          <Popover
            className="user-menu"
            trigger={({ toggle }) => (
              <button type="button" className="user-card" onClick={toggle}>
                <Avatar name={user?.full_name ?? "User"} size={32} />
                <span className="user-text">
                  <strong>{user?.full_name}</strong>
                  <small>{user?.email}</small>
                </span>
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-profile">
                  <strong>{user?.full_name}</strong>
                  <span>{user?.email}</span>
                  <RoleBadge role={role} />
                </div>
                <div className="menu-sep" />
                <MenuItem
                  icon={<Settings size={15} />}
                  onClick={() => {
                    close();
                    navigate("/settings");
                  }}
                >
                  Settings
                </MenuItem>
                <MenuItem icon={theme.resolved === "dark" ? <Sun size={15} /> : <Moon size={15} />} onClick={theme.toggle}>
                  {theme.resolved === "dark" ? "Light mode" : "Dark mode"}
                </MenuItem>
                <MenuItem
                  danger
                  icon={<LogOut size={15} />}
                  onClick={async () => {
                    await logout();
                    navigate("/login");
                  }}
                >
                  Sign out
                </MenuItem>
              </>
            )}
          </Popover>
          <button className="icon-btn collapse-btn" type="button" title="Collapse sidebar" onClick={() => setCollapsed((v) => !v)}>
            <PanelLeftClose size={17} />
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <button className="mobile-only logo-btn" type="button" onClick={() => navigate("/")} aria-label="Home">
            <LogoMark size={26} />
          </button>
          <h1 className="topbar-title">{TITLES[location.pathname] ?? ""}</h1>
          <button className="search-trigger" type="button" onClick={() => setPalette(true)}>
            <Search size={15} />
            <span>Search or jump to…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <span className={`live-pill ${stream}`} title="Real-time updates over Server-Sent Events + Redis pub/sub">
              <span className="live-dot" />
              {streamLabel}
            </span>
            <button className="icon-btn" type="button" onClick={theme.toggle} aria-label="Toggle theme" title="Toggle theme">
              {theme.resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NotificationBell />
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>

      <TaskDrawerHost />
      {palette && <CommandPalette onClose={() => setPalette(false)} toggleTheme={theme.toggle} />}
    </div>
  );
}
