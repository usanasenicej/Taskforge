export type OrgRole = "owner" | "admin" | "member" | "viewer";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  created_at: string;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface Member {
  user_id: number;
  email: string;
  full_name: string;
  role: OrgRole;
  created_at: string;
}

export interface Project {
  id: number;
  organization_id: number;
  name: string;
  key: string;
  description: string | null;
  created_by: number;
  created_at: string;
}

export interface Task {
  id: number;
  organization_id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: number;
  assignee_ids: number[];
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  task_id: number;
  user_id: number;
  body: string;
  created_at: string;
}

export interface Metrics {
  organization_id: number;
  tasks_total: number;
  tasks_created_today: number;
  tasks_by_status: Record<TaskStatus, number>;
  tasks_overdue: number;
  open_tasks: number;
}

export interface RegisterResponse {
  user: User;
  organization: Organization;
  email_verification_required: boolean;
  dev_verification_code?: string;
}

export interface VerifyResponse {
  verified: boolean;
  message: string;
  tokens?: TokenResponse;
}

export interface ResendResponse {
  sent?: boolean;
  verified?: boolean;
  message: string;
  dev_verification_code?: string;
}

export interface Notification {
  kind: "assigned" | "updated" | "comment" | "overdue";
  title: string;
  body: string;
  org_id: number;
  task_id: number | null;
  created_at: string;
}

export interface Inbox {
  items: Notification[];
  unread: number;
}

export interface OrgEvent {
  type: string;
  org_id: number;
  actor_id: number | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface Health {
  status: "ok" | "degraded";
  checks: { database: boolean; redis: boolean };
  redis_backend: "redis" | "memory";
  database_backend: string;
}

export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recovery_codes_left: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
}
