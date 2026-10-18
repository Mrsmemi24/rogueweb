"use client";

import { useEffect, useState } from "react";

type MatchRecord = {
  id: string;
  playerName: string;
  levelReached: number;
  enemiesDefeated: number;
  durationSeconds: number;
  result: string;
  createdAt: string;
};

type MatchHistoryResponse = {
  data: MatchRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMatchHistoryResponse(
  value: unknown
): value is MatchHistoryResponse {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) {
    return false;
  }

  const { page, limit, total, totalPages } = value.pagination;
  return (
    [page, limit, total, totalPages].every(
      (field) => typeof field === "number" && Number.isSafeInteger(field)
    ) &&
    value.data.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.playerName === "string" &&
        typeof item.levelReached === "number" &&
        typeof item.enemiesDefeated === "number" &&
        typeof item.durationSeconds === "number" &&
        typeof item.result === "string" &&
        typeof item.createdAt === "string" &&
        !Number.isNaN(Date.parse(item.createdAt))
    )
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes} min ${remainingSeconds} s`
    : `${remainingSeconds} s`;
}

function formatResult(result: string) {
  if (result === "victory") return "Victoria";
  if (result === "defeat") return "Derrota";
  if (result === "abandoned") return "Abandonada";
  return `Resultado: ${result}`;
}

export default function MatchHistory() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MatchHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/telemetry?page=${page}&limit=20`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Tu sesión expiró. Inicia sesión de nuevo."
              : "No se pudo cargar tu historial."
          );
        }

        const body: unknown = await response.json();
        if (!isMatchHistoryResponse(body)) {
          throw new Error("El servidor devolvió un historial inválido.");
        }

        setResult(body);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar tu historial."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page]);

  const changePage = (nextPage: number) => {
    setLoading(true);
    setError("");
    setPage(nextPage);
  };

  if (loading) {
    return <p role="status">Cargando tu historial…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/40 p-4 text-red-200">
        {error}
      </p>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-300">
        Todavía no hay partidas guardadas en tu historial.
      </p>
    );
  }

  return (
    <section aria-label="Partidas guardadas" className="space-y-4">
      <ul className="space-y-3">
        {result.data.map((match) => (
          <li
            key={match.id}
            className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2"
          >
            <span className="font-semibold">{formatResult(match.result)}</span>
            <time
              className="text-sm text-slate-400 sm:text-right"
              dateTime={match.createdAt}
            >
              {new Intl.DateTimeFormat("es", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(match.createdAt))}
            </time>
            <span className="text-sm text-slate-300">
              Nivel {match.levelReached} · {match.enemiesDefeated} centinelas
              derrotados
            </span>
            <span className="text-sm text-slate-300 sm:text-right">
              Duración: {formatDuration(match.durationSeconds)}
            </span>
          </li>
        ))}
      </ul>

      <nav
        aria-label="Paginación del historial"
        className="flex items-center justify-between"
      >
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => changePage(page - 1)}
          className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-50"
        >
          Anterior
        </button>
        <span aria-live="polite">
          Página {page} de {Math.max(1, result.pagination.totalPages)}
        </span>
        <button
          type="button"
          disabled={page >= result.pagination.totalPages}
          onClick={() => changePage(page + 1)}
          className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-50"
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
