
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

type GameEnemy = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
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
  enemies: GameEnemy[];
};

type Props = {
  gameState: GameState | null;
  currentPlayerId?: string;
  onMove: (direction: Direction) => void;
  onAttack: () => void;
};

type PlayerView = {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type EnemyView = {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export default function AuthoritativeCanvas({
  gameState,
  currentPlayerId,
  onMove,
  onAttack,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  const gameStateRef = useRef<GameState | null>(gameState);
  const playerIdRef = useRef(currentPlayerId);
  const onMoveRef = useRef(onMove);
  const onAttackRef = useRef(onAttack);

  useEffect(() => {
    gameStateRef.current = gameState;
    playerIdRef.current = currentPlayerId;
    onMoveRef.current = onMove;
    onAttackRef.current = onAttack;
  }, [gameState, currentPlayerId, onMove, onAttack]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return;

    class AuthoritativeScene extends Phaser.Scene {
      private graphics!: Phaser.GameObjects.Graphics;
      private exitMarker!: Phaser.GameObjects.Rectangle;

      private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
      private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
      private attackKey?: Phaser.Input.Keyboard.Key;
      private lastMoveDirection?: Direction;
      private lastMoveAt = 0;

      private playerViews = new Map<string, PlayerView>();
      private enemyViews = new Map<string, EnemyView>();

      private lastState: GameState | null | undefined;
      private mapSignature = "";

      private tileSize = 32;
      private offsetX = 0;
      private offsetY = 0;

      private handleFocusLoss = () => {
        this.input.keyboard?.resetKeys();
        this.lastMoveDirection = undefined;
        this.lastMoveAt = 0;
      };

      private handleVisibilityChange = () => {
        if (document.hidden) {
          this.handleFocusLoss();
        }
      };

      private removeInputListeners = () => {
        window.removeEventListener("blur", this.handleFocusLoss);
        document.removeEventListener(
          "visibilitychange",
          this.handleVisibilityChange
        );
      };

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
          this.attackKey = keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.SPACE
          );

          keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT,
            Phaser.Input.Keyboard.KeyCodes.W,
            Phaser.Input.Keyboard.KeyCodes.A,
            Phaser.Input.Keyboard.KeyCodes.S,
            Phaser.Input.Keyboard.KeyCodes.D,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
          ]);
        }

        this.scale.on(
          Phaser.Scale.Events.RESIZE,
          this.handleResize,
          this
        );
        window.addEventListener("blur", this.handleFocusLoss);
        document.addEventListener(
          "visibilitychange",
          this.handleVisibilityChange
        );
        this.events.once(
          Phaser.Scenes.Events.SHUTDOWN,
          this.removeInputListeners
        );
        this.events.once(
          Phaser.Scenes.Events.DESTROY,
          this.removeInputListeners
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

        if (!state) {
          this.lastMoveDirection = undefined;
          this.lastMoveAt = 0;
          return;
        }

        if (
          document.hidden ||
          (document.activeElement instanceof HTMLElement &&
            document.activeElement.isContentEditable) ||
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          this.handleFocusLoss();
          return;
        }

        if (
          this.attackKey &&
          Phaser.Input.Keyboard.JustDown(this.attackKey)
        ) {
          onAttackRef.current();
          return;
        }

        if (!this.cursors || !this.wasd) return;

        const direction: Direction | undefined =
          this.cursors.left.isDown || this.wasd.left.isDown
            ? "left"
            : this.cursors.right.isDown || this.wasd.right.isDown
              ? "right"
              : this.cursors.up.isDown || this.wasd.up.isDown
                ? "up"
                : this.cursors.down.isDown || this.wasd.down.isDown
                  ? "down"
                  : undefined;

        // Enviamos una intención de movimiento.
        // El jugador NO cambia de coordenadas aquí.
        if (!direction) {
          this.lastMoveDirection = undefined;
          this.lastMoveAt = 0;
        } else if (
          direction !== this.lastMoveDirection ||
          this.time.now - this.lastMoveAt >= 180
        ) {
          onMoveRef.current(direction);
          this.lastMoveDirection = direction;
          this.lastMoveAt = this.time.now;
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

          for (const view of this.enemyViews.values()) {
            view.body.destroy();
            view.label.destroy();
          }

          this.enemyViews.clear();
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

        const enemyIds = new Set(
          state.enemies.map((enemy) => enemy.id)
        );

        for (const [id, view] of this.enemyViews) {
          if (!enemyIds.has(id)) {
            view.body.destroy();
            view.label.destroy();
            this.enemyViews.delete(id);
          }
        }

        for (const enemy of state.enemies) {
          let view = this.enemyViews.get(enemy.id);

          if (!view) {
            const body = this.add
              .rectangle(0, 0, this.tileSize * 0.55, this.tileSize * 0.55, 0xf87171)
              .setDepth(2);
            const label = this.add
              .text(0, 0, "", {
                fontFamily: "monospace",
                fontSize: "10px",
                color: "#ffffff",
                backgroundColor: "#7f1d1d",
                padding: { x: 2, y: 1 },
              })
              .setOrigin(0.5, 1)
              .setDepth(3);

            view = { body, label };
            this.enemyViews.set(enemy.id, view);
          }

          const centerX =
            this.offsetX +
            enemy.x * this.tileSize +
            this.tileSize / 2;
          const centerY =
            this.offsetY +
            enemy.y * this.tileSize +
            this.tileSize / 2;
          const defeated = enemy.status === "defeated";

          view.body
            .setPosition(centerX, centerY)
            .setSize(this.tileSize * 0.55, this.tileSize * 0.55)
            .setFillStyle(defeated ? 0x64748b : 0xf87171);

          view.label
            .setText(defeated ? "Derrotado" : `${enemy.hp}/${enemy.maxHp}`)
            .setFontSize(Math.max(8, Math.floor(this.tileSize * 0.22)))
            .setPosition(centerX, centerY - this.tileSize * 0.4)
            .setBackgroundColor(defeated ? "#334155" : "#7f1d1d");
        }

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
