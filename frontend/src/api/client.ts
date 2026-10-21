import type {
  Comment,
  Health,
  Inbox,
  Member,
  Metrics,
  MfaChallenge,
  OrgEvent,
  OrgRole,
  Organization,
  Project,
  RegisterResponse,
  ResendResponse,
  Task,
  TaskPriority,
  TaskStatus,
  TokenResponse,
  TwoFactorSetup,
  TwoFactorStatus,
  User,
  VerifyResponse,
} from "./types";

const API = "/api/v1";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export function getAccessToken() {
  return localStorage.getItem("tf_access");
}

export function setTokens(tokens: Pick<TokenResponse, "access_token" | "refresh_token">) {
  localStorage.setItem("tf_access", tokens.access_token);
  localStorage.setItem("tf_refresh", tokens.refresh_token);
}

export function clearTokens() {
  localStorage.removeItem("tf_access");
  localStorage.removeItem("tf_refresh");
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail
        .map((item: { msg?: string; loc?: string[] }) => {
          const field = item.loc?.[item.loc.length - 1];
          const msg = (item.msg ?? "Invalid value").replace(/^Value error, /, "");
          return field && field !== "body" ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
        })
        .join(" · ");
    }
    return res.statusText || "Something went wrong";
  } catch {
    return res.statusText || "Something went wrong";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the refresh token for a new pair. Concurrent callers share one request. */
export function refreshAccess(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refresh = localStorage.getItem("tf_refresh");
    if (!refresh) return false;
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      setTokens((await res.json()) as TokenResponse);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const access = getAccessToken();
  if (access) headers.set("Authorization", `Bearer ${access}`);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the TaskForge API. Is the backend running?");
  }
  if (res.status === 401 && retry && access) {
    if (await refreshAccess()) return request<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return (await res.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export type TaskInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  assignee_ids?: number[];
};

export const api = {
  register: (payload: { email: string; password: string; full_name: string; organization_name: string }) =>
    request<RegisterResponse>("/auth/register", json("POST", payload)),
  login: (email: string, password: string) =>
    request<TokenResponse | MfaChallenge>("/auth/login", json("POST", { email, password })),
  loginSecondFactor: (mfaToken: string, code: string) =>
    request<TokenResponse>("/auth/login/2fa", json("POST", { mfa_token: mfaToken, code })),
  twoFactorStatus: () => request<TwoFactorStatus>("/auth/2fa"),
  twoFactorSetup: () => request<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" }),
  twoFactorEnable: (code: string) =>
    request<{ enabled: boolean; recovery_codes: string[] }>("/auth/2fa/enable", json("POST", { code })),
  twoFactorDisable: (password: string, code: string) =>
    request<void>("/auth/2fa/disable", json("POST", { password, code })),
  verifyEmail: (email: string, code: string) =>
    request<VerifyResponse>("/auth/verify-email", json("POST", { email, code })),
  resendVerification: (email: string) =>
    request<ResendResponse>("/auth/resend-verification", json("POST", { email })),
  me: () => request<User>("/auth/me"),
  logout: async () => {
    const refresh = localStorage.getItem("tf_refresh");
    if (refresh) {
      try {
        await request("/auth/logout", json("POST", { refresh_token: refresh }));
      } catch {
        /* still clear locally */
      }
    }
    clearTokens();
  },

  orgs: () => request<Organization[]>("/orgs"),
  createOrg: (name: string) => request<Organization>("/orgs", json("POST", { name })),
  members: (orgId: number) => request<Member[]>(`/orgs/${orgId}/members`),
  inviteMember: (orgId: number, payload: { email: string; full_name: string; password?: string; role: OrgRole }) =>
    request<Member>(`/orgs/${orgId}/members`, json("POST", payload)),
  updateMemberRole: (orgId: number, userId: number, role: OrgRole) =>
    request<Member>(`/orgs/${orgId}/members/${userId}`, json("PATCH", { role })),
  removeMember: (orgId: number, userId: number) =>
    request<void>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),

  projects: (orgId: number) => request<Project[]>(`/orgs/${orgId}/projects`),
  createProject: (orgId: number, payload: { name: string; key: string; description?: string }) =>
    request<Project>(`/orgs/${orgId}/projects`, json("POST", payload)),
  updateProject: (orgId: number, projectId: number, payload: { name?: string; description?: string | null }) =>
    request<Project>(`/orgs/${orgId}/projects/${projectId}`, json("PATCH", payload)),
  deleteProject: (orgId: number, projectId: number) =>
    request<void>(`/orgs/${orgId}/projects/${projectId}`, { method: "DELETE" }),

  orgTasks: (orgId: number) => request<Task[]>(`/orgs/${orgId}/tasks`),
  createTask: (orgId: number, projectId: number, payload: TaskInput) =>
    request<Task>(`/orgs/${orgId}/projects/${projectId}/tasks`, json("POST", payload)),
  getTask: (orgId: number, taskId: number) => request<Task>(`/orgs/${orgId}/tasks/${taskId}`),
  updateTask: (orgId: number, taskId: number, payload: Partial<TaskInput>) =>
    request<Task>(`/orgs/${orgId}/tasks/${taskId}`, json("PATCH", payload)),
  deleteTask: (orgId: number, taskId: number) =>
    request<void>(`/orgs/${orgId}/tasks/${taskId}`, { method: "DELETE" }),
  comments: (orgId: number, taskId: number) => request<Comment[]>(`/orgs/${orgId}/tasks/${taskId}/comments`),
  addComment: (orgId: number, taskId: number, body: string) =>
    request<Comment>(`/orgs/${orgId}/tasks/${taskId}/comments`, json("POST", { body })),

  metrics: (orgId: number) => request<Metrics>(`/orgs/${orgId}/metrics`),
  activity: (orgId: number) => request<OrgEvent[]>(`/orgs/${orgId}/activity`),
  notifications: () => request<Inbox>("/notifications"),
  markNotificationsRead: () => request<void>("/notifications/read", { method: "POST" }),
  health: async (): Promise<Health | null> => {
    try {
      const res = await fetch("/health/ready");
      return (await res.json()) as Health;
    } catch {
      return null;
    }
  },
};
