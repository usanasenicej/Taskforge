import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";
import type { Member, OrgEvent, OrgRole, Organization, Project, Task } from "../api/types";
import { useEventStream, type StreamStatus } from "../hooks/useEventStream";
import { useAuth } from "./AuthContext";

type Listener = (event: OrgEvent) => void;

interface OrgState {
  ready: boolean;
  orgs: Organization[];
  org: Organization | null;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  role: OrgRole;
  can: { edit: boolean; manageMembers: boolean; deleteProjects: boolean };
  stream: StreamStatus;
  switchOrg: (id: number) => void;
  reloadOrgs: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadMembers: () => Promise<void>;
  reloadTasks: () => Promise<void>;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: number) => void;
  subscribe: (listener: Listener) => () => void;
}

const OrgContext = createContext<OrgState | null>(null);

function storedOrgId() {
  try {
    return Number(localStorage.getItem("tf_org")) || null;
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  // Stays null until the user's own org list confirms which one to open, so a stale
  // id left in storage by a previous account never triggers requests.
  const [orgId, setOrgId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const listeners = useRef(new Set<Listener>());

  const reloadOrgs = useCallback(async () => {
    const next = await api.orgs();
    setOrgs(next);
    setOrgId((current) => {
      const valid = (id: number | null) => (id !== null && next.some((o) => o.id === id) ? id : null);
      return valid(current) ?? valid(storedOrgId()) ?? next[0]?.id ?? null;
    });
    if (next.length === 0) setReady(true);
  }, []);

  useEffect(() => {
    if (user) void reloadOrgs();
  }, [user, reloadOrgs]);

  const reloadMembers = useCallback(async () => {
    if (orgId) setMembers(await api.members(orgId));
  }, [orgId]);
  const reloadProjects = useCallback(async () => {
    if (orgId) setProjects(await api.projects(orgId));
  }, [orgId]);
  const reloadTasks = useCallback(async () => {
    if (orgId) setTasks(await api.orgTasks(orgId));
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    try {
      localStorage.setItem("tf_org", String(orgId));
    } catch {
      /* storage unavailable */
    }
    let cancelled = false;
    setReady(false);
    Promise.all([api.members(orgId), api.projects(orgId), api.orgTasks(orgId)])
      .then(([m, p, t]) => {
        if (cancelled) return;
        setMembers(m);
        setProjects(p);
        setTasks(t);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const upsertTask = useCallback((task: Task) => {
    setTasks((current) => {
      const index = current.findIndex((t) => t.id === task.id);
      if (index === -1) return [task, ...current];
      const next = current.slice();
      next[index] = { ...current[index], ...task };
      return next;
    });
  }, []);

  const removeTask = useCallback((taskId: number) => {
    setTasks((current) => current.filter((t) => t.id !== taskId));
  }, []);

  const handleEvent = useCallback(
    (event: OrgEvent) => {
      const payload = event.payload as Record<string, unknown>;
      switch (event.type) {
        case "task.created":
        case "task.updated": {
          const { changes: _changes, ...task } = payload;
          upsertTask(task as unknown as Task);
          break;
        }
        case "task.deleted":
          removeTask(payload.id as number);
          break;
        case "comment.created":
          setTasks((current) =>
            current.map((t) => (t.id === payload.task_id ? { ...t, comment_count: t.comment_count + 1 } : t)),
          );
          break;
        case "project.created":
          void reloadProjects();
          break;
      }
      listeners.current.forEach((listener) => listener(event));
    },
    [upsertTask, removeTask, reloadProjects],
  );

  const stream = useEventStream(user ? orgId : null, handleEvent);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const role: OrgRole = members.find((m) => m.user_id === user?.id)?.role ?? "viewer";

  const value = useMemo<OrgState>(
    () => ({
      ready,
      orgs,
      org: orgs.find((o) => o.id === orgId) ?? null,
      members,
      projects,
      tasks,
      role,
      can: {
        edit: role !== "viewer",
        manageMembers: role === "owner" || role === "admin",
        deleteProjects: role === "owner" || role === "admin",
      },
      stream,
      switchOrg: setOrgId,
      reloadOrgs,
      reloadProjects,
      reloadMembers,
      reloadTasks,
      upsertTask,
      removeTask,
      subscribe,
    }),
    [ready, orgs, orgId, members, projects, tasks, role, stream, reloadOrgs, reloadProjects, reloadMembers, reloadTasks, upsertTask, removeTask, subscribe],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

export function useOrgEvents(listener: Listener) {
  const { subscribe } = useOrg();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}
