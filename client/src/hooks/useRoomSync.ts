import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyRoomState,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
} from "@shared/protocol";
import { randomClientId } from "@/lib/utils";

export type RoomSync = {
  state: RoomState;
  viewers: number;
  serverTime: number;
  connected: boolean;
  // True after the first state snapshot from the server has been applied.
  // Distinguishes "fresh room with null video" from "haven't heard back yet".
  stateLoaded: boolean;
  clientId: string;
  actions: {
    play: (currentTime: number) => void;
    pause: (currentTime: number) => void;
    seek: (currentTime: number) => void;
    setMuted: (muted: boolean) => void;
    setUrl: (videoUrl: string) => void;
  };
};

export function useRoomSync(roomId: string): RoomSync {
  const [state, setState] = useState<RoomState>(emptyRoomState());
  const [viewers, setViewers] = useState(0);
  const [serverTime, setServerTime] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const clientIdRef = useRef<string>(randomClientId());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}&client=${clientIdRef.current}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onmessage = (event) => {
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
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const actions = useMemo(
    () => ({
      play: (currentTime: number) => send({ type: "play", currentTime }),
      pause: (currentTime: number) => send({ type: "pause", currentTime }),
      seek: (currentTime: number) => send({ type: "seek", currentTime }),
      setMuted: (muted: boolean) => send({ type: "setMuted", muted }),
      setUrl: (videoUrl: string) => send({ type: "setUrl", videoUrl }),
    }),
    [send],
  );

  return {
    state,
    viewers,
    serverTime,
    connected,
    stateLoaded,
    clientId: clientIdRef.current,
    actions,
  };
}
