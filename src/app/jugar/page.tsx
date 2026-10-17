
import Link from "next/link";
import GameCanvas from "@/components/GameCanvas";
import TouchControls from "@/components/TouchControls";

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
            Explora los pasillos, derrota a los centinelas y encuentra
            la salida sin perder toda tu vida.
          </p>
        </header>

        <GameCanvas />

        <TouchControls />

        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-bold">Controles</h2>

          <p className="mt-2 text-sm text-slate-300">
            PC: WASD o flechas para moverte; espacio para atacar.
          </p>

          <p className="mt-2 text-sm text-slate-300">
            Móvil: usa el pad direccional y el botón ATACAR.
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Los enemigos persiguen al jugador después de cada acción
            válida. La partida termina al alcanzar cero puntos de vida.
          </p>
        </section>
      </div>
    </main>
  );
}
