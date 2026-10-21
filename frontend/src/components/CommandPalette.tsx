import { FolderKanban, LayoutDashboard, LogOut, Moon, Plus, Search, Settings, SquareKanban, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { taskRef } from "../lib/format";
import { StatusIcon } from "./Badges";
import { useTaskComposer } from "./TaskComposer";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({ onClose, toggleTheme }: { onClose: () => void; toggleTheme: () => void }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { tasks, projects, can } = useOrg();
  const compose = useTaskComposer();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    const base: Command[] = [
      ...(can.edit
        ? [{ id: "new", group: "Actions", label: "Create task", hint: "C", icon: <Plus size={16} />, run: () => compose() }]
        : []),
      { id: "dash", group: "Navigate", label: "Dashboard", hint: "G D", icon: <LayoutDashboard size={16} />, run: go("/") },
      { id: "board", group: "Navigate", label: "Board", hint: "G B", icon: <SquareKanban size={16} />, run: go("/board") },
      { id: "projects", group: "Navigate", label: "Projects", hint: "G P", icon: <FolderKanban size={16} />, run: go("/projects") },
      { id: "members", group: "Navigate", label: "Members", hint: "G M", icon: <Users size={16} />, run: go("/members") },
      { id: "settings", group: "Navigate", label: "Settings", icon: <Settings size={16} />, run: go("/settings") },
      { id: "theme", group: "Actions", label: "Toggle dark mode", icon: <Moon size={16} />, run: toggleTheme },
      {
        id: "logout",
        group: "Actions",
        label: "Sign out",
        icon: <LogOut size={16} />,
        run: () => void logout().then(() => navigate("/login")),
      },
    ];
    const projectCmds = projects.map<Command>((p) => ({
      id: `p${p.id}`,
      group: "Projects",
      label: p.name,
      hint: p.key,
      icon: <span className="key-chip sm">{p.key}</span>,
      run: () => navigate(`/board?project=${p.id}`),
    }));
    const taskCmds = tasks.map<Command>((t) => {
      const key = projects.find((p) => p.id === t.project_id)?.key;
      return {
        id: `t${t.id}`,
        group: "Tasks",
        label: t.title,
        hint: taskRef(key, t.id),
        icon: <StatusIcon status={t.status} />,
        run: () => navigate(`/board?task=${t.id}`),
      };
    });
    return [...base, ...projectCmds, ...taskCmds];
  }, [navigate, logout, tasks, projects, can.edit, compose, toggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.group !== "Tasks").concat(commands.filter((c) => c.group === "Tasks").slice(0, 6));
    return commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q)).slice(0, 30);
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (cmd?: Command) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  let lastGroup = "";
  return createPortal(
    <div className="overlay top" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Search tasks, projects, or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                run(results[index]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">No results for “{query}”</p>}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  data-index={i}
                  className={`palette-item ${i === index ? "active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(cmd)}
                >
                  <span className="palette-icon">{cmd.icon}</span>
                  <span className="palette-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
