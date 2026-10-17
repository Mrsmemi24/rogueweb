"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type LobbyPlayer = {
  id: string;
  name: string;
  ready: boolean;
};

type LobbyState = {
  roomId: string;
  players: LobbyPlayer[];
};

type ServerToClientEvents = {
  "lobby:state": (state: LobbyState) => void;
  "app:error": (payload: { message: string }) => void;
};

type ClientToServerEvents = {
  "lobby:join": (payload: { roomId: string; playerName: string }) => void;
  "lobby:ready": (payload: { ready: boolean }) => void;
};

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

export default function LobbyPanel() {
  const socketRef = useRef<
    Socket<ServerToClientEvents, ClientToServerEvents> | null
  >(null);

  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("mazmorra-1");
  const [playerName, setPlayerName] = useState("Explorador");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(SOCKET_URL);
    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      setError("");
    };

    const handleDisconnect = () => {
      setConnected(false);
      setLobby(null);
    };

    const handleConnectError = () => {
      setConnected(false);
      setError(
        "No se pudo conectar al servidor. Comprueba que esté ejecutándose."
      );
    };

    const handleLobbyState = (state: LobbyState) => {
      setLobby(state);
      setError("");
    };

    const handleAppError = (payload: { message: string }) => {
      setError(payload.message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("lobby:state", handleLobbyState);
    socket.on("app:error", handleAppError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("lobby:state", handleLobbyState);
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

    socket.emit("lobby:join", {
      roomId,
      playerName,
    });
  };

  const currentPlayer = lobby?.players.find(
    (player) => player.id === socketRef.current?.id
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

  return (
    <section className="my-6 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Multijugador · Lobby de prueba
        </h2>

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
          className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Entrar a la sala
        </button>

        <button
          type="button"
          onClick={toggleReady}
          disabled={!connected || !currentPlayer}
          className="rounded-lg border border-slate-600 px-4 py-2 font-semibold hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                  {player.id === socketRef.current?.id ? " (tú)" : ""}
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

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Esta sala sirve para probar la comunicación en tiempo real. Todavía no
        inicia una partida multijugador.
      </p>
    </section>
  );
}