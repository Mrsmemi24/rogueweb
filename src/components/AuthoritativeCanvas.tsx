
"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";

type Direction = "up" | "down" | "left" | "right";

type GamePlayer = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  status: "alive" | "defeated";
};

type GameState = {
  roomId: string;
  seed: number;
  map: string[];
  exit: {
    x: number;
    y: number;
  };
  players: GamePlayer[];
};

type Props = {
  gameState: GameState | null;
  currentPlayerId?: string;
  onMove: (direction: Direction) => void;
};

type PlayerView = {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export default function AuthoritativeCanvas({
  gameState,
  currentPlayerId,
  onMove,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  const gameStateRef = useRef<GameState | null>(gameState);
  const playerIdRef = useRef(currentPlayerId);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    gameStateRef.current = gameState;
    playerIdRef.current = currentPlayerId;
    onMoveRef.current = onMove;
  }, [gameState, currentPlayerId, onMove]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return;

    class AuthoritativeScene extends Phaser.Scene {
      private graphics!: Phaser.GameObjects.Graphics;
      private exitMarker!: Phaser.GameObjects.Rectangle;

      private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
      private wasd?: Record<string, Phaser.Input.Keyboard.Key>;

      private playerViews = new Map<string, PlayerView>();

      private lastState: GameState | null | undefined;
      private mapSignature = "";

      private tileSize = 32;
      private offsetX = 0;
      private offsetY = 0;

      constructor() {
        super("AuthoritativeScene");
      }

      create() {
        this.graphics = this.add.graphics();
        this.exitMarker = this.add
          .rectangle(0, 0, this.tileSize * 0.55, this.tileSize * 0.55, 0x4ade80)
          .setDepth(1)
          .setVisible(false);

        const keyboard = this.input.keyboard;

        if (keyboard) {
          this.cursors = keyboard.createCursorKeys();

          this.wasd = keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
          }) as Record<string, Phaser.Input.Keyboard.Key>;

          keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT,
            Phaser.Input.Keyboard.KeyCodes.W,
            Phaser.Input.Keyboard.KeyCodes.A,
            Phaser.Input.Keyboard.KeyCodes.S,
            Phaser.Input.Keyboard.KeyCodes.D,
          ]);
        }

        this.scale.on(
          Phaser.Scale.Events.RESIZE,
          this.handleResize,
          this
        );

        this.renderState();
      }

      update() {
        const state = gameStateRef.current;

        // Solo redibujamos a los jugadores cuando llega
        // un estado nuevo del servidor.
        if (state !== this.lastState) {
          this.renderState();
        }

        if (!state || !this.cursors || !this.wasd) {
          return;
        }

        const left =
          Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
          Phaser.Input.Keyboard.JustDown(this.wasd.left);

        const right =
          Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
          Phaser.Input.Keyboard.JustDown(this.wasd.right);

        const up =
          Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
          Phaser.Input.Keyboard.JustDown(this.wasd.up);

        const down =
          Phaser.Input.Keyboard.JustDown(this.cursors.down) ||
          Phaser.Input.Keyboard.JustDown(this.wasd.down);

        // Enviamos una intención de movimiento.
        // El jugador NO cambia de coordenadas aquí.
        if (left) {
          onMoveRef.current("left");
        } else if (right) {
          onMoveRef.current("right");
        } else if (up) {
          onMoveRef.current("up");
        } else if (down) {
          onMoveRef.current("down");
        }
      }

      private renderState() {
        const state = gameStateRef.current;

        this.lastState = state;

        if (!state || state.map.length === 0) {
          this.graphics.clear();
          this.mapSignature = "";
          this.exitMarker.setVisible(false);

          for (const view of this.playerViews.values()) {
            view.body.destroy();
            view.label.destroy();
          }

          this.playerViews.clear();
          return;
        }

        const rows = state.map.length;
        const columns = Math.max(
          ...state.map.map((row) => row.length)
        );

        this.tileSize = Math.max(
          8,
          Math.min(
            48,
            Math.floor((this.scale.width - 20) / columns),
            Math.floor((this.scale.height - 50) / rows)
          )
        );

        const boardWidth = columns * this.tileSize;
        const boardHeight = rows * this.tileSize;

        this.offsetX = Math.floor(
          (this.scale.width - boardWidth) / 2
        );

        this.offsetY = Math.floor(
          (this.scale.height - boardHeight) / 2
        );

        const signature = [
          state.map.join("|"),
          this.tileSize,
          this.scale.width,
          this.scale.height,
        ].join(":");

        if (signature !== this.mapSignature) {
          this.drawMap(state.map);
          this.mapSignature = signature;
        }

        this.exitMarker
          .setPosition(
            this.offsetX +
              state.exit.x * this.tileSize +
              this.tileSize / 2,
            this.offsetY +
              state.exit.y * this.tileSize +
              this.tileSize / 2
          )
          .setSize(this.tileSize * 0.55, this.tileSize * 0.55)
          .setVisible(true);

        const activeIds = new Set(
          state.players.map((player) => player.id)
        );

        for (const [id, view] of this.playerViews) {
          if (!activeIds.has(id)) {
            view.body.destroy();
            view.label.destroy();

            this.playerViews.delete(id);
          }
        }

        for (const player of state.players) {
          let view = this.playerViews.get(player.id);

          if (!view) {
            const body = this.add.rectangle(
              0,
              0,
              this.tileSize * 0.55,
              this.tileSize * 0.55,
              0x22d3ee
            );

            body.setDepth(2);

            const label = this.add.text(0, 0, "", {
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#ffffff",
              backgroundColor: "#0f172a",
              padding: { x: 3, y: 2 },
            });

            label.setOrigin(0.5, 1);
            label.setDepth(3);

            view = { body, label };

            this.playerViews.set(player.id, view);
          }

          const centerX =
            this.offsetX +
            player.x * this.tileSize +
            this.tileSize / 2;

          const centerY =
            this.offsetY +
            player.y * this.tileSize +
            this.tileSize / 2;

          const isCurrentPlayer =
            player.id === playerIdRef.current;

          view.body
            .setPosition(centerX, centerY)
            .setSize(
              this.tileSize * 0.55,
              this.tileSize * 0.55
            )
            .setFillStyle(
              isCurrentPlayer ? 0x22d3ee : 0xfbbf24
            );

          view.label
            .setText(player.name.slice(0, 12))
            .setFontSize(Math.max(9, Math.floor(this.tileSize * 0.25)))
            .setPosition(centerX, centerY - this.tileSize * 0.4);
        }
      }

      private drawMap(map: string[]) {
        this.graphics.clear();

        for (let y = 0; y < map.length; y++) {
          for (let x = 0; x < map[y].length; x++) {
            const wall = map[y][x] === "#";

            const pixelX =
              this.offsetX + x * this.tileSize;

            const pixelY =
              this.offsetY + y * this.tileSize;

            this.graphics.fillStyle(
              wall ? 0x334155 : 0x111827,
              1
            );

            this.graphics.fillRect(
              pixelX,
              pixelY,
              this.tileSize,
              this.tileSize
            );

            this.graphics.lineStyle(1, 0x475569, 0.6);

            this.graphics.strokeRect(
              pixelX,
              pixelY,
              this.tileSize,
              this.tileSize
            );
          }
        }
      }

      private handleResize() {
        // Forzamos a recalcular el tamaño del tablero.
        this.mapSignature = "";
        this.renderState();
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: host,
      backgroundColor: "#0b1120",
      width: host.clientWidth || 800,
      height: host.clientHeight || 440,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: host.clientWidth || 800,
        height: host.clientHeight || 440,
      },
      scene: [AuthoritativeScene],
    });

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.floor(host.clientWidth);
      const height = Math.floor(host.clientHeight);

      if (width > 0 && height > 0) {
        game.scale.resize(width, height);
      }
    });

    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      game.destroy(true);
      host.querySelectorAll("canvas").forEach((canvas) => {
        canvas.remove();
      });
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-label="Tablero multijugador autoritativo"
      className="relative h-[440px] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
    >
      {!gameState && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-slate-400">
          Entra en una sala para cargar el tablero del servidor.
        </div>
      )}
    </div>
  );
}
