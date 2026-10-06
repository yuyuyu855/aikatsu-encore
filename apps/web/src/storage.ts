import { applyUndo, canUndoLatest, diffAppState, emptyInventory, sameInventory, validateBackup, validateStorePreference,
  type AppState, type Backup, type HistoryAction, type HistoryEvent, type Inventory, type StorePreference } from '@aikatsu/domain';
import { CATALOG_CARDS } from './catalog';

export type { AppState } from '@aikatsu/domain';
const DATABASE = 'aikatsu-encore-local';
const STATE = 'state';
const EVENTS = 'events';
const STORES = 'storePreferences';
const KEY = 'inventory';
let databasePromise: Promise<IDBDatabase> | undefined;

export function normalizeInventory(backup: Pick<Backup, 'inventory'>): Inventory[] {
  const existing = new Map(backup.inventory.map((item) => [item.cardId, item]));
  return CATALOG_CARDS.map((card) => existing.get(card.id) ?? emptyInventory(card.id));
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('このブラウザでは端末内保存を利用できません。')); return; }
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE)) database.createObjectStore(STATE);
      if (!database.objectStoreNames.contains(EVENTS)) database.createObjectStore(EVENTS, { keyPath: 'id' }).createIndex('sequence', 'sequence', { unique: true });
      if (!database.objectStoreNames.contains(STORES)) database.createObjectStore(STORES, { keyPath: 'storeId' });
      // Version-1 state.inventory is intentionally neither rewritten nor reset.
    };
    request.onerror = () => reject(request.error ?? new Error('保存先を開けませんでした。'));
    request.onblocked = () => reject(new Error('別のタブを閉じてから、再読み込みしてください。'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
  }).catch((error: unknown) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

function readState(transaction: IDBTransaction, complete: (state: AppState, sequence: number) => void, fail: (error: unknown) => void) {
  const requests = [transaction.objectStore(STATE).get(KEY), transaction.objectStore(STATE).get('revision'),
    transaction.objectStore(STATE).get('eventSequence'), transaction.objectStore(EVENTS).getAll(), transaction.objectStore(STORES).getAll()];
  let remaining = requests.length;
  for (const request of requests) request.onsuccess = () => {
    if (--remaining !== 0) return;
    try {
      const saved = requests[0].result === undefined ? { schemaVersion: 1, inventory: [] } : requests[0].result;
      const inventory = validateBackup(saved, CATALOG_CARDS);
      if (!inventory.ok) throw new Error(inventory.errors.join(' '));
      const metadata = validateBackup({ schemaVersion: 2, inventory: inventory.value.inventory, history: requests[3].result, storePreferences: requests[4].result }, CATALOG_CARDS);
      if (!metadata.ok || metadata.value.schemaVersion !== 2) throw new Error(metadata.ok ? '保存形式が不正です。' : metadata.errors.join(' '));
      const revision: unknown = requests[1].result ?? 0;
      const sequence: unknown = requests[2].result ?? metadata.value.history.reduce((max, event) => Math.max(max, event.sequence), 0);
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) throw new Error('保存データの更新番号が不正です。');
      if (metadata.value.history.some((event) => event.sequence > sequence)) throw new Error('保存データの履歴番号が不正です。');
      complete({ inventory: normalizeInventory(metadata.value), history: metadata.value.history, storePreferences: metadata.value.storePreferences, revision }, sequence);
    } catch (error) { fail(error); }
  };
}

export async function loadAppState(): Promise<AppState> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STATE, EVENTS, STORES], 'readonly');
    let value: AppState | undefined;
    let failure: unknown;
    readState(transaction, (state) => { value = state; }, (error) => { failure = error; transaction.abort(); });
    transaction.oncomplete = () => value ? resolve(value) : reject(new Error('保存データを読み込めませんでした。'));
    transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('保存データを読み込めませんでした。'));
  });
}

interface Mutation {
  inventory: Inventory[];
  storePreferences: StorePreference[];
  action: HistoryAction;
  undoOf?: string;
  replaceHistory?: HistoryEvent[];
}

async function mutate(expectedRevision: number, prepare: (state: AppState) => Mutation | null): Promise<AppState> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STATE, EVENTS, STORES], 'readwrite');
    let result: AppState | undefined;
    let failure: unknown;
    const fail = (error: unknown) => { failure = error; transaction.abort(); };
    readState(transaction, (current, sequence) => {
      try {
        if (current.revision !== expectedRevision) throw new Error('別の操作でデータが更新されています。再読み込みしてから操作してください。');
        const mutation = prepare(current);
        if (!mutation) { result = current; return; }
        const changes = diffAppState(current, mutation);
        if (changes.length === 0 && (!mutation.replaceHistory || (mutation.replaceHistory.length === 0 && current.history.length === 0))) { result = current; return; }
        if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('更新番号の上限に達しました。');
        const eventStore = transaction.objectStore(EVENTS);
        let history = current.history;
        const allocate = () => { if (sequence >= Number.MAX_SAFE_INTEGER) throw new Error('履歴番号の上限に達しました。'); return ++sequence; };
        if (mutation.replaceHistory) {
          const mapping = new Map(mutation.replaceHistory.map((event) => [event.id, crypto.randomUUID()]));
          history = mutation.replaceHistory.map((event) => ({ ...event, id: mapping.get(event.id)!, sequence: allocate(), importedFromId: event.id,
            ...(event.undoOf ? { undoOf: mapping.get(event.undoOf)! } : {}) }));
          eventStore.clear();
          for (const event of history) eventStore.add(event);
        }
        const event: HistoryEvent = { id: crypto.randomUUID(), sequence: allocate(), occurredAt: new Date().toISOString(), action: mutation.action, changes,
          ...(mutation.undoOf ? { undoOf: mutation.undoOf } : {}) };
        history = [...history, event];
        const checked = validateBackup({ schemaVersion: 2, inventory: mutation.inventory, history, storePreferences: mutation.storePreferences }, CATALOG_CARDS);
        if (!checked.ok || checked.value.schemaVersion !== 2) throw new Error(checked.ok ? '保存形式が不正です。' : checked.errors.join(' '));
        result = { inventory: normalizeInventory(checked.value), history: checked.value.history, storePreferences: checked.value.storePreferences, revision: current.revision + 1 };
        transaction.objectStore(STATE).put({ schemaVersion: 1, inventory: result.inventory }, KEY);
        transaction.objectStore(STATE).put(result.revision, 'revision');
        transaction.objectStore(STATE).put(sequence, 'eventSequence');
        transaction.objectStore(STORES).clear();
        for (const preference of result.storePreferences) transaction.objectStore(STORES).put(preference);
        eventStore.add(event);
      } catch (error) { fail(error); }
    }, fail);
    transaction.oncomplete = () => result ? resolve(result) : reject(new Error('保存データを更新できませんでした。'));
    transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('保存が中断されました。変更は反映していません。'));
  });
}

export interface InventoryCommit {
  before: Inventory[];
  next: Inventory[];
  expectedRevision: number;
  action: Exclude<HistoryAction, 'store' | 'undo'>;
}
export function commitInventory(input: InventoryCommit): Promise<AppState> {
  return mutate(input.expectedRevision, (state) => {
    const checkedBefore = validateBackup({ schemaVersion: 1, inventory: input.before }, CATALOG_CARDS);
    if (!checkedBefore.ok) throw new Error(checkedBefore.errors.join(' '));
    const previous = normalizeInventory({ inventory: input.before });
    if (state.inventory.some((item, index) => !sameInventory(item, previous[index]))) throw new Error('変更前の所持データが一致しません。再読み込みしてください。');
    const checked = validateBackup({ schemaVersion: 1, inventory: input.next }, CATALOG_CARDS);
    if (!checked.ok) throw new Error(checked.errors.join(' '));
    return { inventory: normalizeInventory(checked.value), storePreferences: state.storePreferences, action: input.action };
  });
}

export function saveStorePreference(input: Omit<StorePreference, 'updatedAt'>, expectedRevision: number): Promise<AppState> {
  return mutate(expectedRevision, (state) => {
    const checked = validateStorePreference({ ...input, updatedAt: new Date().toISOString() });
    if (!checked.ok) throw new Error(checked.errors.join(' '));
    const old = state.storePreferences.find((preference) => preference.storeId === input.storeId);
    if (old && old.favorite === input.favorite && old.machineCount === input.machineCount && old.note === input.note) return null;
    if (!old && !input.favorite && input.machineCount === null && input.note === '') return null;
    const preference = checked.value;
    return { inventory: state.inventory, storePreferences: [...state.storePreferences.filter((item) => item.storeId !== input.storeId), preference], action: 'store' };
  });
}

export function undoLatest(eventId: string, expectedRevision: number): Promise<AppState> {
  return mutate(expectedRevision, (state) => {
    const event = state.history.find((item) => item.id === eventId);
    if (!event || !canUndoLatest(event, state.history)) throw new Error('最新のカード・店舗操作だけを取り消せます。復元・取り消し・読込履歴は取り消せません。');
    const restored = applyUndo(event, state);
    if (!restored.ok) throw new Error(restored.errors.join(' '));
    return { ...restored.value, action: 'undo', undoOf: event.id };
  });
}

export function restoreBackup(backup: Backup, expectedRevision: number): Promise<AppState> {
  const checked = validateBackup(backup, CATALOG_CARDS);
  if (!checked.ok) return Promise.reject(new Error(checked.errors.join(' ')));
  return mutate(expectedRevision, (state) => checked.value.schemaVersion === 1
    ? { inventory: normalizeInventory(checked.value), storePreferences: state.storePreferences, action: 'restore' }
    : { inventory: normalizeInventory(checked.value), storePreferences: checked.value.storePreferences, replaceHistory: checked.value.history, action: 'restore' });
}

// Legacy callers keep working while feature screens adopt the shared state API.
export async function loadInventory(): Promise<Inventory[]> { return (await loadAppState()).inventory; }
export async function saveInventory(inventory: Inventory[]): Promise<void> {
  const state = await loadAppState();
  await commitInventory({ before: state.inventory, next: inventory, expectedRevision: state.revision, action: 'adjust' });
}
