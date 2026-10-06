import { emptyInventory, validateInventory } from './index';
import type { CatalogCard, Inventory, ValidationResult } from './index';

export interface StorePreference {
  storeId: string;
  favorite: boolean;
  machineCount: number | null;
  note: string;
  updatedAt: string;
}
export type HistoryAction = 'owned' | 'offered' | 'wanted' | 'adjust' | 'store' | 'restore' | 'undo';
export type HistoryChange =
  | { kind: 'inventory'; targetId: string; before: Inventory; after: Inventory }
  | { kind: 'store'; targetId: string; before: StorePreference | null; after: StorePreference | null };
export interface HistoryEvent {
  id: string;
  sequence: number;
  occurredAt: string;
  action: HistoryAction;
  changes: HistoryChange[];
  undoOf?: string;
  importedFromId?: string;
}
export interface AppState {
  inventory: Inventory[];
  history: HistoryEvent[];
  storePreferences: StorePreference[];
  revision: number;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const invalid = <T>(message: string): ValidationResult<T> => ({ ok: false, errors: [message] });

export function validateStorePreference(value: unknown): ValidationResult<StorePreference> {
  if (!record(value) || !id(value.storeId) || typeof value.favorite !== 'boolean' || (value.machineCount !== null && (!integer(value.machineCount) || value.machineCount > 999)) || typeof value.note !== 'string' || value.note.length > 2000 || !timestamp(value.updatedAt)) {
    return invalid('店舗設定のID・お気に入り・台数（0～999、未記入はnull）・メモ（2000文字以内）・日時を確認してください。');
  }
  // Historical store IDs remain valid even when no longer present in the public directory.
  return { ok: true, value: { storeId: value.storeId, favorite: value.favorite, machineCount: value.machineCount as number | null, note: value.note, updatedAt: value.updatedAt } };
}

export function validateStorePreferences(value: unknown): ValidationResult<StorePreference[]> {
  if (!Array.isArray(value)) return invalid('店舗設定の配列が必要です。');
  const values: StorePreference[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const [index, entry] of value.entries()) {
    const result = validateStorePreference(entry);
    if (!result.ok) errors.push(...result.errors.map((error) => `店舗設定${index + 1}件目: ${error}`));
    else {
      if (seen.has(result.value.storeId)) errors.push(`店舗ID「${result.value.storeId}」が重複しています。`);
      seen.add(result.value.storeId);
      values.push(result.value);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: values };
}

export function sameInventory(left: Inventory, right: Inventory): boolean {
  return left.cardId === right.cardId && left.owned === right.owned && left.offered === right.offered && left.wanted === right.wanted;
}
export function sameStorePreference(left: StorePreference | null, right: StorePreference | null): boolean {
  return left === null || right === null ? left === right : left.storeId === right.storeId && left.favorite === right.favorite && left.machineCount === right.machineCount && left.note === right.note && left.updatedAt === right.updatedAt;
}

export function validateHistory(value: unknown, catalog: readonly CatalogCard[]): ValidationResult<HistoryEvent[]> {
  if (!Array.isArray(value)) return invalid('操作履歴の配列が必要です。');
  const errors: string[] = [];
  const events: HistoryEvent[] = [];
  const known = new Set(catalog.map((card) => card.id));
  const ids = new Set<string>();
  const sequences = new Set<number>();
  const actions: readonly string[] = ['owned', 'offered', 'wanted', 'adjust', 'store', 'restore', 'undo'];
  for (const [index, entry] of value.entries()) {
    const prefix = `操作履歴${index + 1}件目: `;
    if (!record(entry) || !id(entry.id) || !integer(entry.sequence) || entry.sequence === 0 || !timestamp(entry.occurredAt) || typeof entry.action !== 'string' || !actions.includes(entry.action) || !Array.isArray(entry.changes) || (entry.undoOf !== undefined && !id(entry.undoOf)) || (entry.importedFromId !== undefined && !id(entry.importedFromId))) {
      errors.push(prefix + 'ID・順序・日時・操作種別・変更内容を確認してください。');
      continue;
    }
    if (ids.has(entry.id)) errors.push(prefix + '履歴IDが重複しています。');
    if (sequences.has(entry.sequence)) errors.push(prefix + '履歴の順序が重複しています。');
    ids.add(entry.id);
    sequences.add(entry.sequence);
    const changes: HistoryChange[] = [];
    const targets = new Set<string>();
    for (const change of entry.changes) {
      if (!record(change) || !id(change.targetId)) { errors.push(prefix + '変更対象が不正です。'); continue; }
      const key = `${change.kind}:${change.targetId}`;
      if (targets.has(key)) errors.push(prefix + '変更対象が重複しています。');
      targets.add(key);
      if (change.kind === 'inventory') {
        const before = validateInventory(change.before), after = validateInventory(change.after);
        if (!known.has(change.targetId) || !before.ok || !after.ok || before.value.cardId !== change.targetId || after.value.cardId !== change.targetId || sameInventory(before.value, after.value)) errors.push(prefix + 'カード参照・変更前後の数量が不正です。');
        else changes.push({ kind: 'inventory', targetId: change.targetId, before: before.value, after: after.value });
      } else if (change.kind === 'store') {
        const before = change.before === null ? { ok: true as const, value: null } : validateStorePreference(change.before);
        const after = change.after === null ? { ok: true as const, value: null } : validateStorePreference(change.after);
        if (!before.ok || !after.ok || (before.value && before.value.storeId !== change.targetId) || (after.value && after.value.storeId !== change.targetId) || (before.ok && after.ok && sameStorePreference(before.value, after.value))) errors.push(prefix + '店舗の変更前後が不正です。');
        else changes.push({ kind: 'store', targetId: change.targetId, before: before.value, after: after.value });
      } else errors.push(prefix + '変更対象の種別が不正です。');
    }
    if (entry.action !== 'restore' && changes.length === 0) errors.push(prefix + '変更のない操作は履歴に保存できません。');
    if (entry.action === 'store' && changes.some((change) => change.kind !== 'store')) errors.push(prefix + '店舗操作の変更対象が不正です。');
    if (['owned', 'offered', 'wanted', 'adjust'].includes(entry.action) && changes.some((change) => change.kind !== 'inventory')) errors.push(prefix + 'カード操作の変更対象が不正です。');
    for (const change of changes) if (change.kind === 'inventory') {
      const { before, after } = change;
      const validOwned = before.owned !== after.owned && before.wanted === after.wanted && (before.offered === after.offered || (after.owned < before.owned && before.offered > after.owned && after.offered === after.owned));
      const validOffered = before.offered !== after.offered && before.owned === after.owned && before.wanted === after.wanted;
      const validWanted = before.wanted !== after.wanted && before.owned === after.owned && before.offered === after.offered;
      if ((entry.action === 'owned' && !validOwned) || (entry.action === 'offered' && !validOffered) || (entry.action === 'wanted' && !validWanted)) errors.push(prefix + '操作種別と変更した項目が一致しません。');
    }
    if ((entry.action === 'undo') !== (entry.undoOf !== undefined)) errors.push(prefix + '取り消し元の参照が不正です。');
    events.push({ id: entry.id, sequence: entry.sequence, occurredAt: entry.occurredAt, action: entry.action as HistoryAction, changes,
      ...(entry.undoOf === undefined ? {} : { undoOf: entry.undoOf as string }), ...(entry.importedFromId === undefined ? {} : { importedFromId: entry.importedFromId as string }) });
  }
  const undone = new Set<string>();
  for (const event of events) if (event.action === 'undo') {
    const original = events.find((item) => item.id === event.undoOf);
    if (!original || original.sequence >= event.sequence || original.action === 'undo' || original.action === 'restore') errors.push(`履歴「${event.id}」の取り消し元は、それより前のカード・店舗操作を指定してください。`);
    if (undone.has(event.undoOf!)) errors.push(`履歴「${event.id}」の取り消し元が重複しています。`);
    undone.add(event.undoOf!);
    if (original) {
      const inverses = event.changes.length === original.changes.length && original.changes.every((change) => event.changes.some((inverse) => {
        if (change.kind !== inverse.kind || change.targetId !== inverse.targetId) return false;
        return change.kind === 'inventory' && inverse.kind === 'inventory'
          ? sameInventory(change.before, inverse.after) && sameInventory(change.after, inverse.before)
          : change.kind === 'store' && inverse.kind === 'store' && sameStorePreference(change.before, inverse.after) && sameStorePreference(change.after, inverse.before);
      }));
      if (!inverses) errors.push(`履歴「${event.id}」の変更前後が取り消し元の逆操作と一致しません。`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: events.sort((left, right) => left.sequence - right.sequence) };
}

export function canUndoLatest(event: HistoryEvent, history: readonly HistoryEvent[]): boolean {
  const latest = history.reduce<HistoryEvent | undefined>((last, item) => !last || item.sequence > last.sequence ? item : last, undefined);
  return latest?.id === event.id && event.action !== 'undo' && event.action !== 'restore' && !event.importedFromId;
}

export function diffAppState(before: Pick<AppState, 'inventory' | 'storePreferences'>, after: Pick<AppState, 'inventory' | 'storePreferences'>): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const oldInventory = new Map(before.inventory.map((item) => [item.cardId, item]));
  for (const item of after.inventory) {
    const previous = oldInventory.get(item.cardId) ?? emptyInventory(item.cardId);
    if (!sameInventory(previous, item)) changes.push({ kind: 'inventory', targetId: item.cardId, before: { ...previous }, after: { ...item } });
  }
  const oldStores = new Map(before.storePreferences.map((item) => [item.storeId, item]));
  const nextStores = new Map(after.storePreferences.map((item) => [item.storeId, item]));
  for (const storeId of new Set([...oldStores.keys(), ...nextStores.keys()])) {
    const previous = oldStores.get(storeId) ?? null, next = nextStores.get(storeId) ?? null;
    if (!sameStorePreference(previous, next)) changes.push({ kind: 'store', targetId: storeId, before: previous && { ...previous }, after: next && { ...next } });
  }
  return changes;
}

export function applyUndo(event: HistoryEvent, current: Pick<AppState, 'inventory' | 'storePreferences'>): ValidationResult<Pick<AppState, 'inventory' | 'storePreferences'>> {
  const inventory = new Map(current.inventory.map((item) => [item.cardId, { ...item }]));
  const preferences = new Map(current.storePreferences.map((item) => [item.storeId, { ...item }]));
  for (const change of event.changes) {
    if (change.kind === 'inventory') {
      const value = inventory.get(change.targetId) ?? emptyInventory(change.targetId);
      if (!sameInventory(value, change.after)) return invalid('現在の所持データが変更後の状態と一致しないため、取り消せません。');
      inventory.set(change.targetId, { ...change.before });
    } else {
      const value = preferences.get(change.targetId) ?? null;
      if (!sameStorePreference(value, change.after)) return invalid('現在の店舗設定が変更後の状態と一致しないため、取り消せません。');
      if (change.before) preferences.set(change.targetId, { ...change.before });
      else preferences.delete(change.targetId);
    }
  }
  return { ok: true, value: { inventory: [...inventory.values()], storePreferences: [...preferences.values()] } };
}
