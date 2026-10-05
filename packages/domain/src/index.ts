export interface CatalogCard {
  id: string;
  number: string;
  name: string;
  rarity?: string;
  verificationStatus?: 'user-screenshot' | 'verified' | 'unverified';
}

export interface Inventory {
  cardId: string;
  owned: number;
  offered: number;
  wanted: boolean;
}

export interface Backup {
  schemaVersion: 1;
  inventory: Inventory[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function emptyInventory(cardId: string): Inventory {
  return { cardId, owned: 0, offered: 0, wanted: false };
}

export function validateInventory(value: unknown): ValidationResult<Inventory> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['所持データはオブジェクトで指定してください。'] };
  }

  const errors: string[] = [];
  if (typeof value.cardId !== 'string' || value.cardId.trim().length === 0) {
    errors.push('カードIDが必要です。');
  }
  if (!isQuantity(value.owned)) {
    errors.push('所持枚数は0以上の安全な整数で指定してください。');
  }
  if (!isQuantity(value.offered)) {
    errors.push('譲れる枚数は0以上の安全な整数で指定してください。');
  }
  if (isQuantity(value.owned) && isQuantity(value.offered) && value.offered > value.owned) {
    errors.push('譲れる枚数は所持枚数以下にしてください。');
  }
  if (typeof value.wanted !== 'boolean') {
    errors.push('欲しい状態はtrueまたはfalseで指定してください。');
  }
  if (errors.length > 0) return { ok: false, errors };

  // Return only the validated fields; file contents cannot supply unrelated state.
  return {
    ok: true,
    value: {
      cardId: value.cardId as string,
      owned: value.owned as number,
      offered: value.offered as number,
      wanted: value.wanted as boolean,
    },
  };
}

export function validateBackup(
  value: unknown,
  catalog: readonly CatalogCard[],
): ValidationResult<Backup> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['バックアップはJSONオブジェクトで指定してください。'] };
  }

  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push('対応していないバックアップ形式です（schemaVersion: 1のみ対応）。');
  if (!Array.isArray(value.inventory)) {
    errors.push('バックアップに所持データの配列が必要です。');
    return { ok: false, errors };
  }

  const knownIds = new Set(catalog.map((card) => card.id));
  const seenIds = new Set<string>();
  const inventory: Inventory[] = [];
  for (const [index, entry] of value.inventory.entries()) {
    const result = validateInventory(entry);
    const prefix = `所持データ${index + 1}件目: `;
    if (!result.ok) {
      errors.push(...result.errors.map((error) => prefix + error));
      continue;
    }
    const item = result.value;
    if (!knownIds.has(item.cardId)) errors.push(prefix + `未登録のカードID「${item.cardId}」です。`);
    if (seenIds.has(item.cardId)) errors.push(prefix + `カードID「${item.cardId}」が重複しています。`);
    seenIds.add(item.cardId);
    inventory.push(item);
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { schemaVersion: 1, inventory } };
}

export function parseBackup(
  text: string,
  catalog: readonly CatalogCard[],
): ValidationResult<Backup> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ['JSONを読み取れません。バックアップファイルの内容を確認してください。'] };
  }
  return validateBackup(value, catalog);
}
