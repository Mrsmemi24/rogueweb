"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import { io, type Socket } from "socket.io-client";

const AuthoritativeCanvas = dynamic(
  () => import("./AuthoritativeCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[440px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300">
        Cargando el tablero multijugador...
      </div>
    ),
  }
);

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
  enemiesDefeated: number;
  status: "alive" | "defeated";
};

type GameEnemy = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
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
  enemies: GameEnemy[];
  status: "active" | "victory" | "defeat";
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
  "game:attack": (payload: {
    direction: Direction;
  }) => void;
};

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

export default function OnlineGame() {
  const socketRef = useRef<
    Socket<ServerToClientEvents, ClientToServerEvents> | null
  >(null);
  const attackDirectionRef = useRef<Direction>("down");
  const movementIntervalRef = useRef<number | null>(null);
  const moveRef = useRef<(direction: Direction) => void>(() => {});

  const [connected, setConnected] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<
    string | undefined
  >();
  const [roomId, setRoomId] = useState("mazmorra-1");
  const [playerName, setPlayerName] = useState("Explorador");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  const stopMoving = useCallback(() => {
    if (movementIntervalRef.current !== null) {
      window.clearInterval(movementIntervalRef.current);
      movementIntervalRef.current = null;
    }
  }, []);

  const move = useCallback((direction: Direction) => {
    const socket = socketRef.current;

    attackDirectionRef.current = direction;

    if (!socket?.connected || !gameState) {
      setError("Primero entra en una sala.");
      return;
    }

    if (gameState.status !== "active") {
      stopMoving();
      return;
    }

    if (
      gameState.players.find((player) => player.id === currentPlayerId)
        ?.status !== "alive"
    ) {
      stopMoving();
      return;
    }

    socket.emit("game:move", { direction });
  }, [currentPlayerId, gameState, stopMoving]);

  const startMoving = useCallback(
    (direction: Direction) => {
      stopMoving();
      move(direction);
      if (
        !gameState ||
        gameState.status !== "active" ||
        gameState.players.find((player) => player.id === currentPlayerId)
          ?.status !== "alive"
      ) {
        return;
      }
      movementIntervalRef.current = window.setInterval(
        () => moveRef.current(direction),
        180
      );
    },
    [currentPlayerId, gameState, move, stopMoving]
  );

  const stopIfPointerLeaves = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        stopMoving();
      }
    },
    [stopMoving]
  );

  useEffect(() => {
    moveRef.current = move;
  }, [move]);

  useEffect(() => {
    const player = gameState?.players.find(
      (candidate) => candidate.id === currentPlayerId
    );
    if (
      !gameState ||
      gameState.status !== "active" ||
      player?.status === "defeated"
    ) {
      stopMoving();
    }
  }, [currentPlayerId, gameState, stopMoving]);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(SOCKET_URL);

    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      setCurrentPlayerId(socket.id);
      setError("");
    };

    const onDisconnect = () => {
      stopMoving();
      setConnected(false);
      setCurrentPlayerId(undefined);
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
      setError("");
    };

    const onAppError = (payload: { message: string }) => {
      setError(payload.message);
    };

    const stopOnFocusLoss = () => stopMoving();
    const stopWhenHidden = () => {
      if (document.hidden) stopMoving();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectionError);
    socket.on("lobby:state", onLobbyState);
    socket.on("game:state", onGameState);
    socket.on("app:error", onAppError);
    window.addEventListener("pointerup", stopOnFocusLoss);
    window.addEventListener("pointercancel", stopOnFocusLoss);
    window.addEventListener("blur", stopOnFocusLoss);
    document.addEventListener("visibilitychange", stopWhenHidden);

    return () => {
      stopMoving();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectionError);
      socket.off("lobby:state", onLobbyState);
      socket.off("game:state", onGameState);
      socket.off("app:error", onAppError);
      window.removeEventListener("pointerup", stopOnFocusLoss);
      window.removeEventListener("pointercancel", stopOnFocusLoss);
      window.removeEventListener("blur", stopOnFocusLoss);
      document.removeEventListener("visibilitychange", stopWhenHidden);

      socket.disconnect();
      socketRef.current = null;
    };
  }, [stopMoving]);

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

  const attack = () => {
    const socket = socketRef.current;

    if (!socket?.connected || !gameState) {
      setError("Primero entra en una sala.");
      return;
    }

    if (gameState.status !== "active") return;

    if (
      gameState.players.find((player) => player.id === currentPlayerId)
        ?.status !== "alive"
    ) {
      return;
    }

    socket.emit("game:attack", {
      direction: attackDirectionRef.current,
    });
  };

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
          onAttack={attack}
        />

        {gameState?.status === "victory" && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-950 px-3 py-2 font-bold text-emerald-200"
          >
            ¡Victoria! Un jugador alcanzó la salida. La partida de la sala ha
            terminado.
          </p>
        )}
        {gameState?.status === "defeat" && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-red-500/40 bg-red-950 px-3 py-2 font-bold text-red-200"
          >
            Derrota: todos los jugadores han sido derrotados.
          </p>
        )}

        {gameState && gameState.players.length > 0 && (
          <div
            aria-label="Estadísticas de la sala"
            className="mt-3 grid gap-2 sm:grid-cols-2"
          >
            {gameState.players.map((player) => (
              <div
                key={player.id}
                aria-label={`Estadísticas de ${player.name}`}
                className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              >
                <span className="w-full font-semibold text-slate-200">
                  {player.name}
                  {player.id === currentPlayerId ? " (tú)" : ""}
                </span>
                <span>
                  HP: {player.hp}/{player.maxHp}
                </span>
                <span>Nivel: {player.level}</span>
                <span>XP: {player.xp}</span>
                <span>Centinelas derrotados: {player.enemiesDefeated}</span>
                <span
                  className={
                    player.status === "alive"
                      ? "text-emerald-300"
                      : "font-bold text-red-300"
                  }
                  role="status"
                >
                  Estado: {player.status === "alive" ? "Vivo" : "Derrotado"}
                </span>
              </div>
            ))}
          </div>
        )}

        {gameState && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 md:hidden">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-label="Mover arriba"
                onPointerDown={(event) => {
                  event.preventDefault();
                  startMoving("up");
                }}
                onPointerLeave={stopMoving}
                onPointerMove={stopIfPointerLeaves}
                onPointerCancel={stopMoving}
                className="h-12 w-14 touch-none select-none rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
              >
                ↑
              </button>

              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Mover a la izquierda"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startMoving("left");
                  }}
                  onPointerLeave={stopMoving}
                  onPointerMove={stopIfPointerLeaves}
                  onPointerCancel={stopMoving}
                  className="h-12 w-14 touch-none select-none rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
                >
                  ←
                </button>

                <button
                  type="button"
                  aria-label="Mover abajo"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startMoving("down");
                  }}
                  onPointerLeave={stopMoving}
                  onPointerMove={stopIfPointerLeaves}
                  onPointerCancel={stopMoving}
                  className="h-12 w-14 touch-none select-none rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
                >
                  ↓
                </button>

                <button
                  type="button"
                  aria-label="Mover a la derecha"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startMoving("right");
                  }}
                  onPointerLeave={stopMoving}
                  onPointerMove={stopIfPointerLeaves}
                  onPointerCancel={stopMoving}
                  className="h-12 w-14 touch-none select-none rounded-lg border border-slate-600 bg-slate-800 text-xl text-cyan-300 active:bg-slate-700"
                >
                  →
                </button>
              </div>
            </div>

            <button
              type="button"
              aria-label="Atacar"
              onClick={attack}
              className="min-h-12 rounded-lg border border-red-400/40 bg-red-950 px-4 py-3 font-bold text-red-200 active:bg-red-900"
            >
              ATACAR
            </button>
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-slate-500">
          PC: WASD o flechas para moverte, espacio para atacar en la última
          dirección indicada. Móvil: usa el pad y ATACAR. El servidor decide
          los resultados del combate.
        </p>
      </div>
    </section>
  );
}