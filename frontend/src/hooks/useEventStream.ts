import { useEffect, useRef, useState } from "react";
import { getAccessToken, refreshAccess } from "../api/client";
import type { OrgEvent } from "../api/types";

export type StreamStatus = "connecting" | "live" | "offline";

/**
 * Subscribes to the org's Server-Sent Events stream. Uses fetch (not EventSource) so the
 * bearer token can go in a header, refreshes the token on 401 and reconnects with backoff.
 */
export function useEventStream(orgId: number | null, onEvent: (event: OrgEvent) => void) {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    let attempt = 0;
    let timer: number | undefined;

    const connect = async () => {
      setStatus("connecting");
      try {
        let res = await open(orgId, controller.signal);
        if (res.status === 401 && (await refreshAccess())) res = await open(orgId, controller.signal);
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setStatus("live");
        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const name = frame.match(/^event: ?(.*)$/m)?.[1];
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (name === "taskforge" && data) {
              try {
                handler.current(JSON.parse(data) as OrgEvent);
              } catch {
                /* ignore malformed frame */
              }
            }
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (controller.signal.aborted) return;
      setStatus("offline");
      attempt += 1;
      timer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
    };

    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [orgId]);

  return status;
}

function open(orgId: number, signal: AbortSignal) {
  return fetch(`/api/v1/orgs/${orgId}/events`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, Accept: "text/event-stream" },
    signal,
  });
}
