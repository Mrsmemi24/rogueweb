"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Direction = "up" | "down" | "left" | "right";

type LobbyPlayer = {
  id: string;
  name: string;
  ready: boolean;
  x: number;
  y: number;
};

type LobbyState = {
  roomId: string;
  players: LobbyPlayer[];
};

type GamePlayer = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  status: "alive" | "defeated";
};

type GameState = {
  roomId: string;
  seed: number;
  map: string[];
  exit: {
    x: number;
    y: number;
  };
  players: GamePlayer[];
};

type ServerToClientEvents = {
  "lobby:state": (state: LobbyState) => void;
  "game:state": (state: GameState) => void;
  "app:error": (payload: { message: string }) => void;
};

type ClientToServerEvents = {
  "lobby:join": (payload: {
    roomId: string;
    playerName: string;
  }) => void;
  "lobby:ready": (payload: {
    ready: boolean;
  }) => void;
  "game:move": (payload: {
    direction: Direction;
  }) => void;
};

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:3001";

export default function LobbyPanel() {
  const socketRef = useRef<
    Socket<ServerToClientEvents, ClientToServerEvents> | null
  >(null);

  const joinedRoomRef = useRef<{ roomId: string; playerName: string } | null>(
    null
  );

  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState("");
  const [roomId, setRoomId] = useState("mazmorra-1");
  const [playerName, setPlayerName] = useState("Explorador");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_URL,
      {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 5_000,
        timeout: 10_000,
      }
    );

    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      setSocketId(socket.id ?? "");
      setError("");

      // Si ya estaba en una sala, vuelve a unirse automáticamente
      if (joinedRoomRef.current) {
        socket.emit("lobby:join", joinedRoomRef.current);
      }
    };

    const handleDisconnect = (reason: string) => {
      setConnected(false);
      setSocketId("");
      setLobby(null);
      setGameState(null);

      console.warn(`Lobby server disconnected (${reason}); reconnecting.`);
      setError("Conexión perdida. Intentando reconectar con el servidor...");

      if (reason === "io server disconnect") {
        socket.connect();
      }
    };

    const handleConnectError = (cause: Error) => {
      setConnected(false);
      setSocketId("");
      console.error(
        `Could not connect to the lobby server at ${SOCKET_URL}:`,
        cause
      );
      setError(
        `No se pudo conectar al servidor en ${SOCKET_URL}. Comprueba que esté ejecutándose.`
      );
    };

    const handleLobbyState = (state: LobbyState) => {
      setLobby(state);
    };

    const handleGameState = (state: GameState) => {
      setGameState(state);
      setError("");
    };

    const handleAppError = (payload: { message: string }) => {
      setError(payload.message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("lobby:state", handleLobbyState);
    socket.on("game:state", handleGameState);
    socket.on("app:error", handleAppError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("lobby:state", handleLobbyState);
      socket.off("game:state", handleGameState);
      socket.off("app:error", handleAppError);

      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinRoom = () => {
    const socket = socketRef.current;

    if (!socket?.connected) {
      setError("El servidor no está conectado.");
      return;
    }

    setError("");
    setLobby(null);
    joinedRoomRef.current = { roomId, playerName };

    socket.emit("lobby:join", {
      roomId,
      playerName,
    });
  };

  const move = (direction: Direction) => {
    const socket = socketRef.current;

    if (!socket?.connected || !gameState) {
      setError("Primero entra en una sala.");
      return;
    }

    // Solo enviamos la intención. El servidor calcula y valida las coordenadas.
    socket.emit("game:move", { direction });
  };

  const currentPlayer = lobby?.players.find(
    (player) => player.id === socketId
  );

  // Jugador actual tomado del estado de juego (posición actualizada)
  const currentGamePlayer = gameState?.players.find(
    (player) => player.id === socketId
  );

  const toggleReady = () => {
    const socket = socketRef.current;

    if (!socket?.connected || !currentPlayer) {
      return;
    }

    socket.emit("lobby:ready", {
      ready: !currentPlayer.ready,
    });
  };

  const otherPlayers = gameState?.players ?? [];

  return (
    <section className="my-6 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Multijugador · RogueWeb</h2>

        <span
          className={
            connected
              ? "rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-300"
              : "rounded-full bg-red-950 px-3 py-1 text-xs text-red-300"
          }
        >
          {connected ? "Servidor conectado" : "Desconectado"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Nombre del jugador
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={20}
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>

        <label className="text-sm text-slate-300">
          Identificador de la sala
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            maxLength={24}
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={joinRoom}
          disabled={!connected}
          className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          Entrar a la sala
        </button>

        <button
          type="button"
          onClick={toggleReady}
          disabled={!connected || !currentPlayer}
          className="rounded-lg border border-slate-600 px-4 py-2 font-semibold disabled:opacity-50"
        >
          {currentPlayer?.ready ? "Cancelar preparación" : "Estoy listo"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {lobby && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="font-semibold">Sala: {lobby.roomId}</h3>

          <p className="mt-1 text-sm text-slate-400">
            Jugadores conectados: {lobby.players.length}
          </p>

          <ul className="mt-3 space-y-2">
            {lobby.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 px-3 py-2"
              >
                <span className="truncate">
                  {player.name}
                  {player.id === socketId ? " (tú)" : ""}
                </span>

                <span
                  className={
                    player.ready
                      ? "text-sm text-emerald-300"
                      : "text-sm text-slate-400"
                  }
                >
                  {player.ready ? "Listo" : "Esperando"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gameState && currentGamePlayer && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="font-semibold">Tablero sincronizado</h3>

          <p className="mt-1 text-sm text-slate-400">
            Tu posición: X = {currentGamePlayer.x}, Y = {currentGamePlayer.y}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Las posiciones mostradas provienen del servidor.
          </p>

          <div className="mt-4 overflow-x-auto">
            <div className="w-fit rounded-lg border border-slate-700 p-1">
              {gameState.map.map((row, y) => (
                <div className="flex" key={y}>
                  {Array.from(row).map((tile, x) => {
                    const player = otherPlayers.find(
                      (candidate) =>
                        candidate.x === x && candidate.y === y
                    );
                    const isExit =
                      gameState.exit.x === x && gameState.exit.y === y;

                    return (
                      <div
                        key={x}
                        title={
                          player
                            ? `${player.name} (${x}, ${y})`
                            : isExit
                              ? "Salida"
                              : tile === "#"
                                ? "Pared"
                                : "Camino"
                        }
                        className={[
                          "flex h-7 w-7 items-center justify-center border border-slate-800 text-xs",
                          tile === "#" ? "bg-slate-700" : "bg-slate-950",
                          player?.id === socketId
                            ? "text-cyan-300"
                            : player
                              ? "text-amber-300"
                              : isExit
                                ? "text-emerald-300"
                              : "text-transparent",
                        ].join(" ")}
                      >
                        {player
                          ? player.name.slice(0, 1).toUpperCase()
                          : isExit
                            ? "E"
                            : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-300">
            HP: {currentGamePlayer.hp}/{currentGamePlayer.maxHp} · Nivel:{" "}
            {currentGamePlayer.level} · XP: {currentGamePlayer.xp} · Estado:{" "}
            {currentGamePlayer.status === "alive" ? "Vivo" : "Derrotado"}
          </p>

          <div className="mt-4 flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label="Mover arriba"
              onClick={() => move("up")}
              className="h-11 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl hover:bg-slate-700"
            >
              ↑
            </button>

            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Mover a la izquierda"
                onClick={() => move("left")}
                className="h-11 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl hover:bg-slate-700"
              >
                ←
              </button>

              <button
                type="button"
                aria-label="Mover abajo"
                onClick={() => move("down")}
                className="h-11 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl hover:bg-slate-700"
              >
                ↓
              </button>

              <button
                type="button"
                aria-label="Mover a la derecha"
                onClick={() => move("right")}
                className="h-11 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl hover:bg-slate-700"
              >
                →
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Prueba los movimientos con dos pestañas abiertas. Las paredes y
            las casillas ocupadas son validadas por el servidor.
          </p>
        </div>
      )}
    </section>
  );
}