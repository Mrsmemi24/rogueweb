export type PlayerState = {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  nextLevelXp: number;
  enemiesDefeated: number;
};

export type EnemyState = {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
};

export function createPlayerState(): PlayerState {
  return {
    hp: 100,
    maxHp: 100,
    attack: 18,
    defense: 3,
    level: 1,
    xp: 0,
    nextLevelXp: 100,
    enemiesDefeated: 0,
  };
}

export function createEnemyState(level: number): EnemyState {
  const safeLevel = Number.isFinite(level)
    ? Math.max(1, Math.floor(level))
    : 1;

  const maxHp = 28 + safeLevel * 8;

  return {
    name: `Centinela nivel ${safeLevel}`,
    level: safeLevel,
    hp: maxHp,
    maxHp,
    attack: 5 + safeLevel * 2,
    defense: Math.floor((safeLevel - 1) / 3),
    xpReward: 50 + safeLevel * 25,
  };
}

// El daño nunca será menor que 1.
export function calculateDamage(
  attack: number,
  defense: number
): number {
  const safeAttack = Number.isFinite(attack)
    ? Math.floor(attack)
    : 0;

  const safeDefense = Number.isFinite(defense)
    ? Math.floor(defense)
    : 0;

  return Math.max(1, safeAttack - safeDefense);
}

// Devuelve un nuevo objeto sin modificar el original.
export function applyDamage<T extends { hp: number }>(
  target: T,
  damage: number
): T {
  const safeDamage = Number.isFinite(damage)
    ? Math.max(0, Math.floor(damage))
    : 0;

  return {
    ...target,
    hp: Math.max(0, target.hp - safeDamage),
  };
}

// Agrega experiencia y aplica automáticamente las subidas de nivel.
export function grantExperience(
  player: PlayerState,
  amount: number
): PlayerState {
  const safeAmount = Number.isFinite(amount)
    ? Math.max(0, Math.floor(amount))
    : 0;

  let updated: PlayerState = {
    ...player,
    xp: player.xp + safeAmount,
  };

  while (updated.xp >= updated.nextLevelXp) {
    const newLevel = updated.level + 1;
    const newMaxHp = updated.maxHp + 15;

    updated = {
      ...updated,
      level: newLevel,
      maxHp: newMaxHp,
      hp: newMaxHp,
      attack: updated.attack + 3,
      defense:
        newLevel % 2 === 0
          ? updated.defense + 1
          : updated.defense,
      nextLevelXp: newLevel * 100,
    };
  }

  return updated;
}