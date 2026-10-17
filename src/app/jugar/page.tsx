
import Link from "next/link";
import OnlineGame from "@/components/OnlineGame";

export default function JugarPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← Volver al inicio
        </Link>

        <header className="my-6">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
            Echoes of the Grid
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Mazmorra de RogueWeb
          </h1>

          <p className="mt-3 text-slate-400">
            Explora la mazmorra compartida. El servidor genera el mapa
            y valida cada movimiento de los jugadores.
          </p>
        </header>

        <OnlineGame />
      </div>
    </main>
  );
}
