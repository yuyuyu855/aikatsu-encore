import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { CATALOG_CARDS } from '@aikatsu/catalog';
import { canUndoLatest, type AppState, type Backup } from '@aikatsu/domain';
let storage: typeof import('../src/storage');
beforeEach(async () => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); storage = await import('../src/storage'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const readDatabase = (version?: number) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('aikatsu-encore-local', version);
  request.onupgradeneeded = () => request.result.createObjectStore('state');
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
async function quantity(state: AppState, owned: number) {
  return storage.commitInventory({ before: state.inventory, next: state.inventory.map((item) => item.cardId === 'e1-01' ? { ...item, owned, offered: Math.min(item.offered, owned) } : item), expectedRevision: state.revision, action: 'owned' });
}
const storeInput = { storeId: 'historical-store-id', favorite: true, machineCount: null, note: 'memo' };
const backup = (state: AppState): Backup => ({ schemaVersion: 2, inventory: state.inventory, history: state.history, storePreferences: state.storePreferences });

describe('version1 migration', () => {
  it('preserves the exact original snapshot while adding stores and normalizing every catalog ID', async () => {
    const database = await readDatabase(1);
    const old = { schemaVersion: 1, inventory: [{ cardId: 'e1-01', owned: 3, offered: 2, wanted: true }, { cardId: 'e1-02', owned: 1, offered: 0, wanted: false }] };
    const transaction = database.transaction('state', 'readwrite'); transaction.objectStore('state').put(old, 'inventory'); await transactionDone(transaction); database.close();
    const state = await storage.loadAppState();
    expect(state.inventory).toHaveLength(CATALOG_CARDS.length); expect(state.inventory[0]).toEqual(old.inventory[0]);
    expect(state).toMatchObject({ revision: 0, history: [], storePreferences: [] });
    const upgraded = await readDatabase(); expect(upgraded.version).toBe(2);
    const request = upgraded.transaction('state').objectStore('state').get('inventory');
    expect(await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); })).toEqual(old); upgraded.close();
  });
});

describe('atomic operation journal', () => {
  it('records immutable before/after and reloads, with no journal/revision for no-op', async () => {
    const initial = await storage.loadAppState(); const first = await quantity(initial, 2);
    expect(first.history).toHaveLength(1); expect(first.history[0]).toMatchObject({ action: 'owned', sequence: 1, changes: [{ kind: 'inventory', targetId: 'e1-01', before: { owned: 0 }, after: { owned: 2 } }] });
    expect(first.history[0].id).toMatch(/^[a-f\d-]{36}$/); expect(Number.isFinite(Date.parse(first.history[0].occurredAt))).toBe(true);
    expect(await quantity(first, 2)).toEqual(first); expect(await storage.loadAppState()).toEqual(first);
    const undone = await storage.undoLatest(first.history[0].id, first.revision);
    expect(undone.inventory[0].owned).toBe(0); expect(undone.history[0]).toEqual(first.history[0]); expect(undone.history[1].undoOf).toBe(first.history[0].id);
    await expect(storage.undoLatest(first.history[0].id, undone.revision)).rejects.toThrow('最新');
  });
  it('normalizes a removed inventory entry into a zero-value change instead of silently dropping it', async () => {
    const first = await quantity(await storage.loadAppState(), 2);
    const cleared = await storage.commitInventory({ before: first.inventory, next: first.inventory.filter((item) => item.cardId !== 'e1-01'), expectedRevision: first.revision, action: 'adjust' });
    expect(cleared.inventory).toHaveLength(CATALOG_CARDS.length); expect(cleared.inventory[0].owned).toBe(0);
    expect(cleared.history[1].changes[0]).toMatchObject({ targetId: 'e1-01', before: { owned: 2 }, after: { owned: 0 } });
  });
  it('logs and undoes store edits, preserves historical IDs, and omits semantic no-op', async () => {
    const first = await storage.saveStorePreference(storeInput, 0);
    expect(first.history[0].action).toBe('store'); expect(first.storePreferences[0]).toMatchObject(storeInput);
    expect(await storage.saveStorePreference(storeInput, first.revision)).toEqual(first);
    const second = await storage.saveStorePreference({ ...storeInput, machineCount: 999, note: 'changed' }, first.revision);
    const undone = await storage.undoLatest(second.history[1].id, second.revision);
    expect(undone.storePreferences).toEqual(first.storePreferences);
    const newest = await storage.saveStorePreference({ ...storeInput, favorite: false }, undone.revision);
    const removed = await storage.undoLatest(newest.history.at(-1)!.id, newest.revision);
    expect(removed.storePreferences).toEqual(first.storePreferences);
    expect(await storage.loadAppState()).toEqual(removed);
  });
  it('serializes concurrent revisions and rejects stale before snapshots', async () => {
    const initial = await storage.loadAppState();
    const outcomes = await Promise.allSettled([quantity(initial, 1), storage.saveStorePreference(storeInput, 0)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const state = await storage.loadAppState(); expect(state.revision).toBe(1); expect(state.history).toHaveLength(1);
    await expect(storage.commitInventory({ before: state.inventory.map((item) => ({ ...item, wanted: !item.wanted })), next: state.inventory, expectedRevision: state.revision, action: 'adjust' })).rejects.toThrow('変更前');
    expect(await storage.loadAppState()).toEqual(state);
  });
  it('undoes a newly created store preference back to absence', async () => {
    const first = await storage.saveStorePreference(storeInput, 0);
    const undone = await storage.undoLatest(first.history[0].id, first.revision);
    expect(undone.storePreferences).toEqual([]);
    expect(undone.history[1].changes[0]).toMatchObject({ kind: 'store', before: first.storePreferences[0], after: null });
  });
  it('rolls back queued inventory, preferences, revision and history when a write transaction aborts', async () => {
    const first = await quantity(await storage.loadAppState(), 1);
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      if (this.name === 'events') queueMicrotask(() => this.transaction.abort());
      return result;
    });
    await expect(storage.saveStorePreference(storeInput, first.revision)).rejects.toThrow();
    vi.restoreAllMocks(); expect(await storage.loadAppState()).toEqual(first);
    const restored = await quantity(first, 2); expect(restored.history[1].sequence).toBe(2);
  });
  it('rejects invalid quantities/store input and corrupt persisted sequence without changing state', async () => {
    const initial = await storage.loadAppState();
    await expect(storage.commitInventory({ before: initial.inventory, next: [{ ...initial.inventory[0], owned: 0, offered: 1 }], expectedRevision: 0, action: 'adjust' })).rejects.toThrow();
    await expect(storage.saveStorePreference({ ...storeInput, machineCount: 1000 }, 0)).rejects.toThrow();
    await expect(storage.saveStorePreference({ storeId: '', favorite: false, machineCount: null, note: '' }, 0)).rejects.toThrow();
    expect(await storage.loadAppState()).toEqual(initial);
    const first = await quantity(initial, 1); const database = await readDatabase();
    const transaction = database.transaction('state', 'readwrite'); transaction.objectStore('state').put(0, 'eventSequence'); await transactionDone(transaction); database.close();
    await expect(storage.loadAppState()).rejects.toThrow('履歴番号'); expect(first.history[0].sequence).toBe(1);
  });
});

describe('backup restore', () => {
  it('preserves history/preferences for legacy imports and disables restore Undo', async () => {
    const first = await quantity(await storage.loadAppState(), 2); const previous = await storage.saveStorePreference(storeInput, first.revision);
    const restored = await storage.restoreBackup({ schemaVersion: 1, inventory: [{ cardId: 'e1-01', owned: 3, offered: 0, wanted: true }] }, previous.revision);
    expect(restored.storePreferences).toEqual(previous.storePreferences); expect(restored.history.slice(0, 2)).toEqual(previous.history);
    expect(restored.history.at(-1)!.action).toBe('restore'); expect(canUndoLatest(restored.history.at(-1)!, restored.history)).toBe(false);
    expect(restored.inventory.find((item) => item.cardId === 'e1-02')!.owned).toBe(0);
  });
  it('restores all schema2 state atomically, safely reidentifies undo refs and remains re-exportable', async () => {
    const first = await quantity(await storage.loadAppState(), 2);
    const reversed = await storage.undoLatest(first.history[0].id, first.revision);
    const source = await storage.saveStorePreference(storeInput, reversed.revision);
    const changed = await quantity(source, 4);
    const restored = await storage.restoreBackup(backup(source), changed.revision);
    expect(restored.inventory).toEqual(source.inventory); expect(restored.storePreferences).toEqual(source.storePreferences);
    expect(restored.history).toHaveLength(source.history.length + 1);
    expect(restored.history[0].id).not.toBe(source.history[0].id); expect(restored.history[0].importedFromId).toBe(source.history[0].id);
    expect(restored.history[1].undoOf).toBe(restored.history[0].id);
    expect(restored.history.at(-1)!.action).toBe('restore'); expect(canUndoLatest(restored.history.at(-1)!, restored.history)).toBe(false);
    expect((await storage.restoreBackup(backup(restored), restored.revision)).history).toHaveLength(restored.history.length + 1);
  });
  it('rejects invalid nested metadata before any partial restore; empty restore is a no-op', async () => {
    const initial = await storage.loadAppState(); expect(await storage.restoreBackup(backup(initial), 0)).toEqual(initial);
    const previous = await storage.saveStorePreference(storeInput, 0);
    const invalid = { ...backup(previous), inventory: [{ cardId: 'e1-01', owned: 9, offered: 0, wanted: false }], storePreferences: [{ ...previous.storePreferences[0], note: 'x'.repeat(2001) }] } as Backup;
    await expect(storage.restoreBackup(invalid, previous.revision)).rejects.toThrow(); expect(await storage.loadAppState()).toEqual(previous);
  });
  it('rolls back a full restore after imported history writes, preserving all four state fields', async () => {
    const first = await quantity(await storage.loadAppState(), 1);
    const previous = await storage.saveStorePreference(storeInput, first.revision);
    const original = IDBObjectStore.prototype.add;
    let abortQueued = false;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      if (this.name === 'events' && !abortQueued) { abortQueued = true; queueMicrotask(() => this.transaction.abort()); }
      return result;
    });
    const target: Backup = { schemaVersion: 2, inventory: [], history: first.history, storePreferences: [] };
    await expect(storage.restoreBackup(target, previous.revision)).rejects.toThrow();
    vi.restoreAllMocks(); expect(await storage.loadAppState()).toEqual(previous);
  });
});
