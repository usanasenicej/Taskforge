import { AlarmClock, Bell, CheckCheck, MessageSquare, PencilLine, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Notification } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { useOrg, useOrgEvents } from "../context/OrgContext";
import { timeAgo } from "../lib/format";
import { Popover } from "./Menu";
import { useToast } from "./Toast";

const KIND_ICON = { assigned: UserPlus, updated: PencilLine, comment: MessageSquare, overdue: AlarmClock };

export function NotificationBell() {
  const { user } = useAuth();
  const { org, switchOrg } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const inbox = await api.notifications();
      setItems(inbox.items);
      setUnread(inbox.unread);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (item: Notification) => {
    if (item.org_id !== org?.id) switchOrg(item.org_id);
    if (item.task_id) navigate(`/board?task=${item.task_id}`);
  };

  useOrgEvents((event) => {
    if (event.type !== "notification" || event.payload.user_id !== user?.id) return;
    const item = event.payload as unknown as Notification;
    setItems((current) => [item, ...current].slice(0, 50));
    setUnread((n) => n + 1);
    toast({
      tone: "info",
      title: item.title,
      body: item.body,
      action: item.task_id ? { label: "View", onClick: () => open(item) } : undefined,
    });
  });

  return (
    <Popover
      align="right"
      className="inbox"
      trigger={({ toggle, open: isOpen }) => (
        <button
          type="button"
          className={`icon-btn bell ${isOpen ? "active" : ""}`}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          onClick={() => {
            toggle();
            if (!isOpen && unread) {
              setUnread(0);
              void api.markNotificationsRead();
            }
          }}
        >
          <Bell size={18} />
          {unread > 0 && <span className="bell-dot">{unread > 9 ? "9+" : unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <header className="inbox-head">
            <strong>Notifications</strong>
            <span className="muted small">
              <CheckCheck size={14} /> Delivered by background workers
            </span>
          </header>
          <div className="inbox-list">
            {items.length === 0 ? (
              <div className="inbox-empty">
                <Bell size={26} />
                <p>You're all caught up</p>
                <span>Assignments, comments and due-date reminders show up here.</span>
              </div>
            ) : (
              items.map((item, i) => {
                const Icon = KIND_ICON[item.kind] ?? Bell;
                return (
                  <button
                    type="button"
                    key={`${item.created_at}-${i}`}
                    className={`inbox-item k-${item.kind}`}
                    onClick={() => {
                      open(item);
                      close();
                    }}
                  >
                    <span className="inbox-icon">
                      <Icon size={15} />
                    </span>
                    <span className="inbox-text">
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                      <time>{timeAgo(item.created_at)}</time>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </Popover>
  );
}
