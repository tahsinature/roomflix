import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  emptySessionState,
  type ClientMessage,
  type Participant,
  type PresenceStatus,
  type ServerMessage,
  type SessionState,
  type SpaceMember,
  type Viewer,
} from "@shared/protocol";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { randomClientId } from "@/lib/utils";

// Single shared WS for the whole authenticated app. Opens when the
// user is in a space; carries playback state, viewers, and presence.
// Pages consume:
//   - useSessionPresence()  → read-only access for nav chips, etc.
//   - useSessionSync()      → /watch surface; flips status to "watching"
//                             on mount and exposes typed playback actions
//
// Replaces the previous 5s poll of /api/session/state. One connection
// per tab; the server dedupes by identity, so multi-tab is fine.

type SessionPresenceValue = {
  state: SessionState | null; // null until first "state" message arrives
  viewers: Viewer[]; // dedupe-by-identity, only people on /watch
  participants: Participant[]; // everyone connected; status per identity
  serverTime: number;
  connected: boolean;
  stateLoaded: boolean;
  members: SpaceMember[];
  clientId: string;
  // Imperative API for /watch and future event surfaces.
  send: (msg: ClientMessage) => void;
  setStatus: (status: PresenceStatus) => void;
};

const DEFAULT: SessionPresenceValue = {
  state: null,
  viewers: [],
  participants: [],
  serverTime: Date.now(),
  connected: false,
  stateLoaded: false,
  members: [],
  clientId: "",
  send: () => {},
  setStatus: () => {},
};

const Ctx = createContext<SessionPresenceValue>(DEFAULT);

export function SessionPresenceProvider({ children }: { children: ReactNode }) {
  const { currentSpace } = useAuth();
  const [state, setState] = useState<SessionState | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [serverTime, setServerTime] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [members, setMembers] = useState<SpaceMember[]>([]);

  // Stable across the provider's lifetime — server uses it for the
  // "updatedBy" attribution and we use it as the WS query param.
  const clientIdRef = useRef<string>(randomClientId());
  const wsRef = useRef<WebSocket | null>(null);
  // Latest desired status. Watch page flips this on mount/unmount; we
  // resend it after every reconnect so the server's view stays correct.
  const desiredStatusRef = useRef<PresenceStatus>("online");

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const setStatus = useCallback(
    (status: PresenceStatus) => {
      desiredStatusRef.current = status;
      send({ type: "setStatus", status });
    },
    [send],
  );

  // Load member directory once per space change. This is independent
  // of the WS — it's a DB read, not a presence event.
  useEffect(() => {
    if (!currentSpace) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    api
      .sessionMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSpace?.id]);

  // WS lifecycle.
  useEffect(() => {
    if (!currentSpace) {
      // Tear down state when leaving a space — fresh start for the next.
      setState(null);
      setViewers([]);
      setParticipants([]);
      setStateLoaded(false);
      setConnected(false);
      return;
    }
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      // Dev: bypass Vite's WS proxy (unreliable; see useSessionSync
      // history). Cookies are host-scoped not port-scoped, so the
      // session cookie still travels.
      const host = import.meta.env.DEV ? `${location.hostname}:3000` : location.host;
      const params = new URLSearchParams({
        client: clientIdRef.current,
        status: desiredStatusRef.current,
      });
      const ws = new WebSocket(`${proto}://${host}/ws?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (ws !== wsRef.current) return;
        setConnected(true);
        // Resend the latest desired status — covers the case where the
        // status changed mid-disconnect (e.g. navigated away from
        // /watch while the socket was reconnecting).
        ws.send(JSON.stringify({ type: "setStatus", status: desiredStatusRef.current } satisfies ClientMessage));
      };
      ws.onclose = () => {
        if (ws !== wsRef.current) return;
        setConnected(false);
        if (!stopped) reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onmessage = (event) => {
        if (ws !== wsRef.current) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "state") {
          setState(msg.state);
          setViewers(msg.viewers);
          setServerTime(msg.serverTime);
          setStateLoaded(true);
        } else if (msg.type === "viewers") {
          setViewers(msg.viewers);
        } else if (msg.type === "presence") {
          setParticipants(msg.participants);
        } else if (msg.type === "memberUpdated") {
          // Patch the cached member row by userId. The membership record
          // is otherwise unchanged — same role, joinedAt, etc. — so a
          // full row replace is the simplest correct thing.
          setMembers((prev) => prev.map((m) => (m.userId === msg.member.userId ? msg.member : m)));
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      if (ws) {
        // Detach handlers before close — onclose from the old socket
        // would otherwise race with the next mount's onopen under
        // StrictMode dev double-mount.
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
      }
      wsRef.current = null;
    };
  }, [currentSpace?.id]);

  const value: SessionPresenceValue = {
    state,
    viewers,
    participants,
    serverTime,
    connected,
    stateLoaded,
    members,
    clientId: clientIdRef.current,
    send,
    setStatus,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionPresence(): SessionPresenceValue {
  return useContext(Ctx);
}

// Convenience: like emptySessionState() from the protocol, but client-
// side so consumers that always need a non-null state can `state ?? empty`.
export const emptyState: SessionState = emptySessionState();
