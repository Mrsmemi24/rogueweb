"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import AuthoritativeCanvas from "./AuthoritativeCanvas";

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
};

type GameState = {
  roomId: string;
  map: string[];
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
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

export default function OnlineGame() {
  const socketRef = useRef<
    Socket<ServerToClientEvents, ClientToServerEvents> | null
  >(null);

  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("mazmorra-1");
  const [playerName, setPlayerName] = useState("Explorador");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(SOCKET_URL);

    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      setError("");
    };

    const onDisconnect = () => {
      setConnected(false);
      setLobby(null);
      setGameState(null);
    };

    const onConnectionError = () => {
      setConnected(false);
      setError("No se pudo conectar con el servidor.");
    };

    const onLobbyState = (state: LobbyState) => {
      setLobby(state);
    };

    const onGameState = (state: GameState) => {
      setGameState(state);
    };

    const onAppError = (payload: { message: string }) => {
      setError(payload.message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectionError);
    socket.on("lobby:state", onLobbyState);
    socket.on("game:state", onGameState);
    socket.on("app:error", onAppError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectionError);
      socket.off("lobby:state", onLobbyState);
      socket.off("game:state", onGameState);
      socket.off("app:error", onAppError);

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
    setGameState(null);

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

    socket.emit("game:move", { direction });
  };

  const currentPlayerId = socketRef.current?.id;

  const currentPlayer = lobby?.players.find(
    (player) => player.id === currentPlayerId
  );

  const toggleReady = () => {
    const socket = socketRef.current;

    if (!socket?.connected || !currentPlayer) return;

    socket.emit("lobby:ready", {
      ready: !currentPlayer.ready,
    });
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Lobby multijugador</h2>

          <span
            className={
              connected
                ? "rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-300"
                : "rounded-full bg-red-950 px-3 py-1 text-xs text-red-300"
            }
          >
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">
            Nombre
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={20}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>

          <label className="text-sm text-slate-300">
            Sala
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
            disabled={!connected}
            onClick={joinRoom}
            className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
          >
            Entrar a la sala
          </button>

          <button
            type="button"
            disabled={!connected || !currentPlayer}
            onClick={toggleReady}
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
          <div className="mt-4 border-t border-slate-800 pt-4">
            <p className="text-sm text-slate-400">
              Sala {lobby.roomId} · {lobby.players.length} jugador(es)
            </p>

            <ul className="mt-2 space-y-2">
              {lobby.players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-sm"
                >
                  <span>
                    {player.name}
                    {player.id === currentPlayerId ? " (tú)" : ""}
                  </span>
                  <span className="text-slate-400">
                    {player.ready ? "Listo" : "Esperando"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3">
          <h2 className="text-xl font-bold">Tablero de la sala</h2>
          <p className="mt-1 text-sm text-slate-400">
            El servidor valida cada movimiento antes de actualizar las
            posiciones.
          </p>
        </div>

        <AuthoritativeCanvas
          gameState={gameState}
          currentPlayerId={currentPlayerId}
          onMove={move}
        />

        {gameState && (
          <div className="mt-4 flex flex-col items-center gap-1 md:hidden">
            <button
              type="button"
              aria-label="Mover arriba"
              onClick={() => move("up")}
              className="h-12 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
            >
              ↑
            </button>

            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Mover a la izquierda"
                onClick={() => move("left")}
                className="h-12 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
              >
                ←
              </button>

              <button
                type="button"
                aria-label="Mover abajo"
                onClick={() => move("down")}
                className="h-12 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
              >
                ↓
              </button>

              <button
                type="button"
                aria-label="Mover a la derecha"
                onClick={() => move("right")}
                className="h-12 w-14 rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
              >
                →
              </button>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-slate-500">
          PC: WASD o flechas. Móvil: utiliza el pad direccional. Las
          posiciones visibles proceden del estado enviado por el servidor.
        </p>
      </div>
    </section>
  );
}