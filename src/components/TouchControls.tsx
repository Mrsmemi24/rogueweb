
"use client";

type Direction = "up" | "down" | "left" | "right";

function sendMove(direction: Direction) {
  window.dispatchEvent(
    new CustomEvent<string>("rogueweb:move", {
      detail: direction,
    })
  );
}

function sendAttack() {
  window.dispatchEvent(new Event("rogueweb:attack"));
}

const buttonClass =
  "flex h-14 w-14 items-center justify-center rounded-xl " +
  "border border-slate-600 bg-slate-800 text-2xl font-bold " +
  "text-cyan-300 active:scale-95 active:bg-slate-700 " +
  "select-none touch-manipulation";

export default function TouchControls() {
  return (
    <section className="mt-4 flex items-center justify-between gap-4 md:hidden">
      <div
        className="grid grid-cols-3 gap-1"
        aria-label="Controles de movimiento"
      >
        <span />
        <button
          type="button"
          className={buttonClass}
          aria-label="Mover arriba"
          onClick={() => sendMove("up")}
        >
          ↑
        </button>
        <span />

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover a la izquierda"
          onClick={() => sendMove("left")}
        >
          ←
        </button>

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover abajo"
          onClick={() => sendMove("down")}
        >
          ↓
        </button>

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover a la derecha"
          onClick={() => sendMove("right")}
        >
          →
        </button>
      </div>

      <button
        type="button"
        onClick={sendAttack}
        className="min-h-14 rounded-xl border border-red-400/40 bg-red-950 px-5 py-3 font-bold text-red-200 active:scale-95 active:bg-red-900 select-none touch-manipulation"
      >
        ATACAR
      </button>
    </section>
  );
}
