
import Link from "next/link";
import { auth } from "@/auth";
import AuthButtons from "@/components/AuthButtons";
import OnlineGame from "@/components/OnlineGame";
import { Suspense } from "react";

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

        <Suspense
          fallback={
            <p role="status" className="text-slate-400">
              Verificando tu sesión…
            </p>
          }
        >
          <JugarContent />
        </Suspense>
      </div>
    </main>
  );
}

async function JugarContent() {
  const session = await auth();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <AuthButtons />
      </div>

      {session?.user?.id ? (
        <OnlineGame />
      ) : (
        <section className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-5">
          <h2 className="text-lg font-bold">Inicia sesión para jugar en línea</h2>
          <p className="mt-2 text-sm text-slate-300">
            La identidad de tu cuenta se valida antes de conectarte al servidor
            multijugador. El modo individual sigue disponible sin iniciar
            sesión.
          </p>
        </section>
      )}
    </>
  );
}
