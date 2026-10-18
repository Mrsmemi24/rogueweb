import Link from "next/link";
import { auth } from "@/auth";
import AuthButtons from "@/components/AuthButtons";
import MatchHistory from "@/components/MatchHistory";
import { Suspense } from "react";

export default function MatchHistoryPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/jugar" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Volver al juego
        </Link>
        <header className="my-6">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
            Echoes of the Grid
          </p>
          <h1 className="mt-2 text-3xl font-black">Mi historial</h1>
          <p className="mt-3 text-slate-400">
            Solo tú puedes consultar los resultados de tus partidas.
          </p>
        </header>

        <Suspense
          fallback={
            <p role="status" className="text-slate-400">
              Verificando tu sesión…
            </p>
          }
        >
          <PrivateMatchHistory />
        </Suspense>
      </div>
    </main>
  );
}

async function PrivateMatchHistory() {
  const session = await auth();

  return session?.user?.id ? (
    <MatchHistory />
  ) : (
    <section className="space-y-4 rounded-xl border border-amber-500/40 bg-amber-950/40 p-5">
      <p>Inicia sesión para consultar tu historial privado.</p>
      <AuthButtons />
    </section>
  );
}
