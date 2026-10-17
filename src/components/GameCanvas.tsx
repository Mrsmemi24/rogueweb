"use client";

import dynamic from "next/dynamic";

const PhaserGame = dynamic(() => import("./PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[440px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300">
      Cargando el motor del juego...
    </div>
  ),
});

export default function GameCanvas() {
  return <PhaserGame />;
}