import LobbyPanel from "@/components/LobbyPanel";
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
          Proyecto universitario · En desarrollo
        </p>

        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          RogueWeb
          <span className="block text-cyan-400">
            Echoes of the Grid
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Explora mazmorras, enfrenta enemigos y sobrevive en un
          mundo generado proceduralmente. Cada decisión cuenta.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">01. Exploración</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Mapas de cuadrícula creados mediante generación procedural.
            </p>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">02. Combate</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Enemigos, estrategia por turnos y muerte permanente.
            </p>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">03. Supervivencia</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Una experiencia diseñada para PC y dispositivos móviles.
            </p>
          </article>
        </div>

        <p className="mt-10 text-sm text-slate-500">
          Fase 2 · Paso 1 — Preparación del proyecto
        </p>
      </section>
    </main>
  );
}
