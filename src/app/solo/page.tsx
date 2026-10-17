

import Link from "next/link";
import GameCanvas from "@/components/GameCanvas";
import TouchControls from "@/components/TouchControls";

export default function SoloPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/jugar"
          className="text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← Ir al modo multijugador
        </Link>

        <header className="my-6">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
            Echoes of the Grid
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Modo individual
          </h1>

          <p className="mt-3 text-slate-400">
            Explora la mazmorra, combate centinelas y busca la salida.
          </p>
        </header>

        <GameCanvas />

        <TouchControls />

        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-bold">Controles</h2>
          <p className="mt-2 text-sm text-slate-300">
            PC: WASD o flechas; espacio para atacar.
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Móvil: pad direccional y botón ATACAR.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Este modo conserva la lógica local de combate.
            Todavía no utiliza el servidor autoritativo.
          </p>
        </section>
      </div>
    </main>
  );
}
