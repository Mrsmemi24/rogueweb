import { describe, expect, it } from "vitest";

import {
  applyDamage,
  calculateDamage,
  createEnemyState,
  createPlayerState,
  grantExperience,
} from "./combat";

describe("Combate y progresión de RogueWeb", () => {
  it("1. Calcula el daño restando la defensa", () => {
    expect(calculateDamage(18, 3)).toBe(15);
  });

  it("2. Garantiza un daño mínimo de 1", () => {
    expect(calculateDamage(3, 10)).toBe(1);
  });

  it("3. Maneja un ataque no finito de forma segura", () => {
    expect(calculateDamage(Number.NaN, 3)).toBe(1);
  });

  it("4. Reduce los puntos de vida correctamente", () => {
    const target = { hp: 50, maxHp: 50 };

    expect(applyDamage(target, 15).hp).toBe(35);
  });

  it("5. Nunca permite puntos de vida negativos", () => {
    const target = { hp: 10 };

    expect(applyDamage(target, 100).hp).toBe(0);
  });

  it("6. No modifica el objeto original al aplicar daño", () => {
    const target = { hp: 50 };

    applyDamage(target, 10);

    expect(target.hp).toBe(50);
  });

  it("7. Crea un enemigo de nivel 1 con los atributos esperados", () => {
    const enemy = createEnemyState(1);

    expect(enemy.level).toBe(1);
    expect(enemy.hp).toBe(36);
    expect(enemy.attack).toBe(7);
    expect(enemy.defense).toBe(0);
    expect(enemy.xpReward).toBe(75);
  });

  it("8. Escala los atributos de los enemigos con su nivel", () => {
    const first = createEnemyState(1);
    const stronger = createEnemyState(4);

    expect(stronger.maxHp).toBeGreaterThan(first.maxHp);
    expect(stronger.attack).toBeGreaterThan(first.attack);
    expect(stronger.defense).toBeGreaterThan(first.defense);
  });

  it("9. Acumula experiencia sin subir de nivel prematuramente", () => {
    const player = createPlayerState();
    const updated = grantExperience(player, 75);

    expect(updated.xp).toBe(75);
    expect(updated.level).toBe(1);
    expect(updated.nextLevelXp).toBe(100);
  });

  it("10. Sube de nivel al alcanzar el umbral", () => {
    const player = createPlayerState();
    const updated = grantExperience(player, 100);

    expect(updated.level).toBe(2);
    expect(updated.maxHp).toBe(115);
    expect(updated.hp).toBe(115);
    expect(updated.attack).toBe(21);
    expect(updated.defense).toBe(4);
    expect(updated.nextLevelXp).toBe(200);
  });

  it("11. Procesa varias subidas de nivel si corresponde", () => {
    const player = createPlayerState();
    const updated = grantExperience(player, 300);

    expect(updated.level).toBe(4);
    expect(updated.nextLevelXp).toBe(400);
  });

  it("12. No resta experiencia si la recompensa es negativa", () => {
    const player = createPlayerState();
    const updated = grantExperience(player, -50);

    expect(updated.xp).toBe(0);
    expect(updated.level).toBe(1);
  });
});