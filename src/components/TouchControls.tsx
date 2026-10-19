
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Direction = "up" | "down" | "left" | "right";

function sendMove(direction: Direction) {
  window.dispatchEvent(
    new CustomEvent<string>("rogueweb:move", {
      detail: direction,
    })
  );
}

function stopWhenPointerLeaves(
  event: ReactPointerEvent<HTMLButtonElement>,
  stopMoving: () => void
) {
  const bounds = event.currentTarget.getBoundingClientRect();

  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  ) {
    stopMoving();
  }
}

function sendAttack() {
  window.dispatchEvent(new Event("rogueweb:attack"));
}

const buttonClass =
  "flex h-14 w-14 items-center justify-center rounded-xl " +
  "border border-slate-600 bg-slate-800 text-2xl font-bold " +
  "text-cyan-300 active:scale-95 active:bg-slate-700 " +
  "select-none touch-none";

export default function TouchControls() {
  const movementIntervalRef = useRef<number | null>(null);

  const stopMoving = useCallback(() => {
    if (movementIntervalRef.current !== null) {
      window.clearInterval(movementIntervalRef.current);
      movementIntervalRef.current = null;
    }
  }, []);

  const startMoving = useCallback(
    (direction: Direction) => {
      stopMoving();
      sendMove(direction);
      movementIntervalRef.current = window.setInterval(
        () => sendMove(direction),
        180
      );
    },
    [stopMoving]
  );

  useEffect(() => {
    const stopOnFocusLoss = () => stopMoving();
    const stopOnGameOver = () => stopMoving();
    const stopWhenHidden = () => {
      if (document.hidden) stopMoving();
    };

    window.addEventListener("pointerup", stopOnFocusLoss);
    window.addEventListener("pointercancel", stopOnFocusLoss);
    window.addEventListener("blur", stopOnFocusLoss);
    window.addEventListener("rogueweb:game-over", stopOnGameOver);
    document.addEventListener("visibilitychange", stopWhenHidden);

    return () => {
      stopMoving();
      window.removeEventListener("pointerup", stopOnFocusLoss);
      window.removeEventListener("pointercancel", stopOnFocusLoss);
      window.removeEventListener("blur", stopOnFocusLoss);
      window.removeEventListener("rogueweb:game-over", stopOnGameOver);
      document.removeEventListener("visibilitychange", stopWhenHidden);
    };
  }, [stopMoving]);

  const beginPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: Direction
  ) => {
    event.preventDefault();
    startMoving(direction);
  };

  const cancelIfPointerLeaves = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => stopWhenPointerLeaves(event, stopMoving);

  return (
    <section className="touch-controls mt-4 items-center justify-between gap-4">
      <div
        className="grid grid-cols-3 gap-1"
        aria-label="Controles de movimiento"
      >
        <span />
        <button
          type="button"
          className={buttonClass}
          aria-label="Mover arriba"
          onPointerDown={(event) => beginPointerMove(event, "up")}
          onPointerMove={cancelIfPointerLeaves}
          onPointerLeave={stopMoving}
          onPointerCancel={stopMoving}
        >
          ↑
        </button>
        <span />

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover a la izquierda"
          onPointerDown={(event) => beginPointerMove(event, "left")}
          onPointerMove={cancelIfPointerLeaves}
          onPointerLeave={stopMoving}
          onPointerCancel={stopMoving}
        >
          ←
        </button>

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover abajo"
          onPointerDown={(event) => beginPointerMove(event, "down")}
          onPointerMove={cancelIfPointerLeaves}
          onPointerLeave={stopMoving}
          onPointerCancel={stopMoving}
        >
          ↓
        </button>

        <button
          type="button"
          className={buttonClass}
          aria-label="Mover a la derecha"
          onPointerDown={(event) => beginPointerMove(event, "right")}
          onPointerMove={cancelIfPointerLeaves}
          onPointerLeave={stopMoving}
          onPointerCancel={stopMoving}
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
