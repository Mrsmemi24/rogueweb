import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export default async function AuthButtons() {
  const session = await auth();

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/jugar" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-cyan-400 px-4 py-2 font-semibold text-cyan-200 hover:bg-cyan-950"
        >
          Iniciar sesión con GitHub
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>Sesión: {session.user.name ?? "Explorador"}</span>
      <Link href="/historial" className="text-cyan-300 hover:text-cyan-100">
        Mi historial
      </Link>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
