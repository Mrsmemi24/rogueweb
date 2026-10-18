import Link from "next/link";
import { auth } from "@/auth";
import AuthButtons from "@/components/AuthButtons";
import OnlineGame from "@/components/OnlineGame";
import { Suspense } from "react";

export default function HomePage() {
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
            RogueWeb: Echoes of the Grid
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Modo multijugador
          </h1>

          <p className="mt-3 text-slate-400">
            Explora el tablero compartido. Cada movimiento se valida
            en el servidor.
          </p>
        </header>
        
        <Link
          href="/jugar"
          className="mt-8 w-fit rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400"
        >
          Jugar ahora
        </Link>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">01. Exploración</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Mapas de cuadrícula creados mediante generación procedural.
            </p>
          </article>
          {/* Si tu grid es de 3 columnas (sm:grid-cols-3), aquí irían los otros dos <article> */}
        </div>

        <Suspense
          fallback={
            <p role="status" className="mt-8 text-slate-400">
              Verificando tu sesión…
            </p>
          }
        >
          <HomeGameContent />
        </Suspense>
      </div>
    </main>
  );
}

async function HomeGameContent() {
  const session = await auth();

  return (
    <>
      <div className="mt-8">
        <AuthButtons />
      </div>

      {session?.user?.id ? (
        <OnlineGame />
      ) : (
        <p className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-300">
          Inicia sesión en la página multijugador para jugar en línea, o elige
          el modo individual sin cuenta.
        </p>
      )}
    </>
  );
}