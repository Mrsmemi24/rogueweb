
"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";

import {
  applyDamage,
  calculateDamage,
  createEnemyState,
  createPlayerState,
  grantExperience,
  type EnemyState,
  type PlayerState,
} from "../game/combat";

import {
  findFarthestFloor,
  generateMaze,
  isWalkable,
  type Maze,
  type Point,
} from "../game/maze";

type VisibleEnemy = {
  x: number;
  y: number;
  stats: EnemyState;
  sprite: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
};

type PathNode = Point & {
  firstStep: Point | null;
};

export default function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return;

    class DungeonScene extends Phaser.Scene {
      private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
      private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
      private attackKey?: Phaser.Input.Keyboard.Key;
      private lastMoveDirection?: "up" | "down" | "left" | "right";
      private lastMoveAt = 0;

      private grid!: Phaser.GameObjects.Graphics;
      private player!: Phaser.GameObjects.Rectangle;
      private exitMarker!: Phaser.GameObjects.Rectangle;
      private statusText!: Phaser.GameObjects.Text;
      private hudText!: Phaser.GameObjects.Text;

      private maze: Maze = [];
      private enemies: VisibleEnemy[] = [];
      private playerState: PlayerState = createPlayerState();

      private readonly tileSize = 32;

      private columns = 1;
      private rows = 1;

      private playerX = 1;
      private playerY = 1;

      private exitX = 1;
      private exitY = 1;

      private completed = false;
      private dead = false;

      private readonly handleFocusLoss = () => {
        this.input.keyboard?.resetKeys();
        this.lastMoveDirection = undefined;
        this.lastMoveAt = 0;
      };

      private readonly handleVisibilityChange = () => {
        if (document.hidden) {
          this.handleFocusLoss();
        }
      };

      private readonly removeFocusListeners = () => {
        window.removeEventListener("blur", this.handleFocusLoss);
        document.removeEventListener(
          "visibilitychange",
          this.handleVisibilityChange
        );
      };

      private readonly handleVirtualMove = (event: Event) => {
        if (this.dead || this.completed) return;

        const direction = (event as CustomEvent<string>).detail;

        const directions: Record<string, Point> = {
          up: { x: 0, y: -1 },
          down: { x: 0, y: 1 },
          left: { x: -1, y: 0 },
          right: { x: 1, y: 0 },
        };

        const movement = directions[direction];

        if (movement) {
          this.movePlayer(movement.x, movement.y);
        }
      };

      private readonly handleVirtualAttack = () => {
        if (this.dead || this.completed) return;

        this.attackEnemy();
      };

      constructor() {
        super("DungeonScene");
      }

      create() {
        this.grid = this.add.graphics();

        this.exitMarker = this.add
          .rectangle(0, 0, 20, 20, 0x4ade80)
          .setDepth(1);

        this.player = this.add
          .rectangle(0, 0, 22, 22, 0x22d3ee)
          .setDepth(3);

        this.statusText = this.add
          .text(10, 10, "", {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#ffffff",
            backgroundColor: "#0f172a",
            padding: { x: 8, y: 6 },
          })
          .setDepth(10)
          .setScrollFactor(0);

        this.hudText = this.add
          .text(0, 36, "", {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#a5f3fc",
            backgroundColor: "#0f172a",
            padding: { x: 6, y: 5 },
          })
          .setOrigin(1, 0)
          .setDepth(10)
          .setScrollFactor(0);
        window.addEventListener("rogueweb:move", this.handleVirtualMove);
        window.addEventListener("rogueweb:attack", this.handleVirtualAttack);
        window.addEventListener("blur", this.handleFocusLoss);
        document.addEventListener(
          "visibilitychange",
          this.handleVisibilityChange
        );

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          window.removeEventListener("rogueweb:move", this.handleVirtualMove);
          window.removeEventListener("rogueweb:attack", this.handleVirtualAttack);
          this.removeFocusListeners();
        });
        this.events.once(
          Phaser.Scenes.Events.DESTROY,
          this.removeFocusListeners
        );

        this.drawBoard(this.scale.width, this.scale.height);

        this.scale.on(
          Phaser.Scale.Events.RESIZE,
          this.handleResize,
          this
        );

        const keyboard = this.input.keyboard;

        if (!keyboard) return;

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

      update() {
        if (document.hidden) {
          this.handleFocusLoss();
          return;
        }

        if (
          !this.cursors ||
          !this.wasd ||
          this.dead ||
          this.completed
        ) {
          this.lastMoveDirection = undefined;
          return;
        }

        if (
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
          this.attackEnemy();
          return;
        }

        const direction:
          | "up"
          | "down"
          | "left"
          | "right"
          | undefined =
          this.cursors.left.isDown || this.wasd.left.isDown
            ? "left"
            : this.cursors.right.isDown || this.wasd.right.isDown
              ? "right"
              : this.cursors.up.isDown || this.wasd.up.isDown
                ? "up"
                : this.cursors.down.isDown || this.wasd.down.isDown
                  ? "down"
                  : undefined;

        if (!direction) {
          this.lastMoveDirection = undefined;
          this.lastMoveAt = 0;
        } else if (
          direction !== this.lastMoveDirection ||
          this.time.now - this.lastMoveAt >= 200
        ) {
          const movement = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 },
          }[direction];

          this.movePlayer(movement.x, movement.y);
          this.lastMoveDirection = direction;
          this.lastMoveAt = this.time.now;
        }
      }

      private drawBoard(width: number, height: number) {
        let nextColumns = Math.max(
          5,
          Math.floor(width / this.tileSize)
        );

        let nextRows = Math.max(
          5,
          Math.floor(height / this.tileSize)
        );

        if (nextColumns % 2 === 0) nextColumns--;
        if (nextRows % 2 === 0) nextRows--;

        const dimensionsChanged =
          nextColumns !== this.columns ||
          nextRows !== this.rows;

        this.columns = nextColumns;
        this.rows = nextRows;

        if (dimensionsChanged) {
          this.startNewRun();
        }

        this.grid.clear();

        for (let y = 0; y < this.rows; y++) {
          for (let x = 0; x < this.columns; x++) {
            const isFloor = this.maze[y][x] === 1;

            const floorColor =
              (x + y) % 2 === 0
                ? 0x263449
                : 0x1e293b;

            this.grid.fillStyle(
              isFloor ? floorColor : 0x0f172a,
              1
            );

            this.grid.fillRect(
              x * this.tileSize,
              y * this.tileSize,
              this.tileSize,
              this.tileSize
            );

            this.grid.lineStyle(1, 0x334155, 0.5);

            this.grid.strokeRect(
              x * this.tileSize,
              y * this.tileSize,
              this.tileSize,
              this.tileSize
            );
          }
        }

        this.positionPlayer();

        this.exitMarker.setPosition(
          this.exitX * this.tileSize + this.tileSize / 2,
          this.exitY * this.tileSize + this.tileSize / 2
        );

        this.hudText.setPosition(width - 10, 36);

        for (const enemy of this.enemies) {
          this.positionEnemy(enemy);
        }

        this.updateHud();
      }

      private startNewRun() {
        // Una semilla nueva para cada nueva partida.
        const seed = Math.floor(
          Math.random() * 2_147_483_647
        );

        this.maze = generateMaze(
          this.columns,
          this.rows,
          seed
        );

        this.playerX = 1;
        this.playerY = 1;

        this.playerState = createPlayerState();

        const exit = findFarthestFloor(this.maze);

        this.exitX = exit.x;
        this.exitY = exit.y;

        this.completed = false;
        this.dead = false;

        this.clearEnemies();
        this.spawnEnemies();

        this.statusText.setText(
          "WASD/Flechas: mover | ESPACIO: atacar"
        );
      }

      private spawnEnemies() {
        const candidates: Point[] = [];

        for (let y = 1; y < this.rows - 1; y++) {
          for (let x = 1; x < this.columns - 1; x++) {
            if (!isWalkable(this.maze, x, y)) continue;

            const startDistance =
              Math.abs(x - this.playerX) +
              Math.abs(y - this.playerY);

            const exitDistance =
              Math.abs(x - this.exitX) +
              Math.abs(y - this.exitY);

            // Evitamos el comienzo y la salida.
            if (startDistance < 4 || exitDistance < 2) {
              continue;
            }

            candidates.push({ x, y });
          }
        }

        // Mezclamos las posibles posiciones.
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));

          [candidates[i], candidates[j]] = [
            candidates[j],
            candidates[i],
          ];
        }

        for (const position of candidates) {
          if (this.enemies.length >= 3) break;

          const tooClose = this.enemies.some(
            (enemy) =>
              Math.abs(enemy.x - position.x) +
                Math.abs(enemy.y - position.y) <
              3
          );

          if (tooClose) continue;

          const stats = createEnemyState(this.playerState.level);

          const sprite = this.add
            .rectangle(0, 0, 22, 22, 0xf87171)
            .setDepth(2);

          const hpText = this.add
            .text(0, 0, String(stats.hp), {
              fontFamily: "monospace",
              fontSize: "10px",
              color: "#ffffff",
              backgroundColor: "#7f1d1d",
              padding: { x: 2, y: 1 },
            })
            .setOrigin(0.5)
            .setDepth(4);

          const enemy: VisibleEnemy = {
            x: position.x,
            y: position.y,
            stats,
            sprite,
            hpText,
          };

          this.enemies.push(enemy);
          this.positionEnemy(enemy);
        }
      }

      private clearEnemies() {
        for (const enemy of this.enemies) {
          enemy.sprite.destroy();
          enemy.hpText.destroy();
        }

        this.enemies = [];
      }

      private positionPlayer() {
        this.player.setPosition(
          this.playerX * this.tileSize + this.tileSize / 2,
          this.playerY * this.tileSize + this.tileSize / 2
        );

        this.player.setDisplaySize(
          this.tileSize * 0.65,
          this.tileSize * 0.65
        );
      }

      private positionEnemy(enemy: VisibleEnemy) {
        const centerX =
          enemy.x * this.tileSize + this.tileSize / 2;

        const centerY =
          enemy.y * this.tileSize + this.tileSize / 2;

        enemy.sprite.setPosition(centerX, centerY);

        enemy.hpText.setPosition(
          centerX,
          centerY + 11
        );

        enemy.hpText.setText(String(enemy.stats.hp));
      }

      private updateHud() {
        this.hudText.setText(
          `HP ${this.playerState.hp}/${this.playerState.maxHp}` +
            ` | Nv ${this.playerState.level}` +
            ` | EXP ${this.playerState.xp}/${this.playerState.nextLevelXp}` +
            ` | Eliminados ${this.playerState.enemiesDefeated}`
        );
      }

      private movePlayer(dx: number, dy: number) {
        const nextX = this.playerX + dx;
        const nextY = this.playerY + dy;

        if (
          nextX < 0 ||
          nextX >= this.columns ||
          nextY < 0 ||
          nextY >= this.rows
        ) {
          return;
        }

        if (!isWalkable(this.maze, nextX, nextY)) {
          return;
        }

        const enemyBlocking = this.enemies.some(
          (enemy) =>
            enemy.x === nextX && enemy.y === nextY
        );

        if (enemyBlocking) {
          this.statusText.setText(
            "Un enemigo bloquea el paso: pulsa ESPACIO."
          );
          return;
        }

        this.playerX = nextX;
        this.playerY = nextY;

        this.positionPlayer();

        if (
          this.playerX === this.exitX &&
          this.playerY === this.exitY
        ) {
          this.completed = true;
          this.statusText.setText(
            "¡Mazmorra completada! Has encontrado la salida."
          );
          return;
        }

        this.enemyTurn();
      }

      private attackEnemy() {
        const enemy = this.enemies.find(
          (candidate) =>
            Math.abs(candidate.x - this.playerX) +
              Math.abs(candidate.y - this.playerY) ===
            1
        );

        if (!enemy) {
          this.statusText.setText(
            "No hay enemigos adyacentes para atacar."
          );
          return;
        }

        const damage = calculateDamage(
          this.playerState.attack,
          enemy.stats.defense
        );

        enemy.stats = applyDamage(enemy.stats, damage);

        if (enemy.stats.hp <= 0) {
          enemy.sprite.destroy();
          enemy.hpText.destroy();

          this.enemies = this.enemies.filter(
            (candidate) => candidate !== enemy
          );

          const oldLevel = this.playerState.level;

          this.playerState = grantExperience(
            {
              ...this.playerState,
              enemiesDefeated:
                this.playerState.enemiesDefeated + 1,
            },
            enemy.stats.xpReward
          );

          const levelMessage =
            this.playerState.level > oldLevel
              ? ` ¡Subiste al nivel ${this.playerState.level}!`
              : "";

          this.statusText.setText(
            `¡Derrotaste al centinela! +${enemy.stats.xpReward} EXP.` +
              levelMessage
          );
        } else {
          this.positionEnemy(enemy);

          this.statusText.setText(
            `Golpeaste al centinela: -${damage} HP.`
          );
        }

        this.updateHud();

        // Los enemigos responden después de la acción válida.
        this.enemyTurn();
      }

      private findNextEnemyStep(
        enemy: VisibleEnemy
      ): Point | null {
        const queue: PathNode[] = [
          {
            x: enemy.x,
            y: enemy.y,
            firstStep: null,
          },
        ];

        const visited = new Set<string>([
          `${enemy.x},${enemy.y}`,
        ]);

        const directions = [
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: -1, dy: 0 },
          { dx: 1, dy: 0 },
        ];

        let head = 0;

        while (head < queue.length) {
          const current = queue[head++];

          if (
            current.x === this.playerX &&
            current.y === this.playerY
          ) {
            return current.firstStep;
          }

          for (const { dx, dy } of directions) {
            const x = current.x + dx;
            const y = current.y + dy;
            const key = `${x},${y}`;

            if (!isWalkable(this.maze, x, y)) {
              continue;
            }

            if (visited.has(key)) {
              continue;
            }

            const occupied = this.enemies.some(
              (other) =>
                other !== enemy &&
                other.x === x &&
                other.y === y
            );

            if (occupied) continue;

            visited.add(key);

            queue.push({
              x,
              y,
              firstStep:
                current.firstStep ?? { x, y },
            });
          }
        }

        return null;
      }

      private enemyTurn() {
        for (const enemy of [...this.enemies]) {
          if (this.dead || this.completed) break;

          const distance =
            Math.abs(enemy.x - this.playerX) +
            Math.abs(enemy.y - this.playerY);

          if (distance === 1) {
            const damage = calculateDamage(
              enemy.stats.attack,
              this.playerState.defense
            );

            this.playerState = applyDamage(
              this.playerState,
              damage
            );

            this.statusText.setText(
              `${enemy.stats.name}: recibes ${damage} de daño.`
            );

            this.updateHud();

            if (this.playerState.hp <= 0) {
              this.dead = true;

              this.statusText.setText(
                "HAS MUERTO. Muerte permanente: partida terminada."
              );

              break;
            }
          } else {
            const next = this.findNextEnemyStep(enemy);

            if (
              next &&
              (next.x !== this.playerX ||
                next.y !== this.playerY)
            ) {
              enemy.x = next.x;
              enemy.y = next.y;

              this.positionEnemy(enemy);
            }
          }
        }

        this.updateHud();
      }

      private handleResize(gameSize: Phaser.Structs.Size) {
        this.drawBoard(gameSize.width, gameSize.height);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: host,
      backgroundColor: "#0b1120",
      width: 800,
      height: 440,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: 800,
        height: 440,
      },
      scene: [DungeonScene],
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-label="Mazmorra de RogueWeb con combate"
      className="h-[440px] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
    />
  );
}
