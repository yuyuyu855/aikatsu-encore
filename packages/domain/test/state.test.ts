import { describe, expect, it } from 'vitest';
import { applyUndo, canUndoLatest, validateBackup, validateHistory, validateStorePreferences, type HistoryEvent, type Inventory, type StorePreference } from '../src/index';
const catalog = [{ id: 'a', number: 'A', name: 'test' }];
const before: Inventory = { cardId: 'a', owned: 1, offered: 0, wanted: false };
const after: Inventory = { ...before, owned: 2 };
const event: HistoryEvent = { id: 'original', sequence: 1, occurredAt: '2026-10-06T00:00:00Z', action: 'owned', changes: [{ kind: 'inventory', targetId: 'a', before, after }] };
const undo: HistoryEvent = { ...event, id: 'undo', sequence: 2, action: 'undo', undoOf: event.id, changes: [{ kind: 'inventory', targetId: 'a', before: after, after: before }] };
const preference: StorePreference = { storeId: 'retired-store', favorite: true, machineCount: null, note: 'personal', updatedAt: event.occurredAt };
const backup = () => ({ schemaVersion: 2, inventory: [after], history: [event], storePreferences: [preference] });

describe('full-state backup', () => {
  it('accepts legacy inventory-only and complete schema2, retaining unknown historical stores', () => {
    expect(validateBackup({ schemaVersion: 1, inventory: [before] }, catalog).ok).toBe(true);
    expect(validateBackup(backup(), catalog).ok).toBe(true);
    expect(validateStorePreferences([{ ...preference, machineCount: 999 }]).ok).toBe(true);
  });
  it.each(['history', 'storePreferences'])('requires schema2 field %s', (field) => {
    const value: Record<string, unknown> = backup(); delete value[field];
    expect(validateBackup(value, catalog).ok).toBe(false);
  });
  it.each([{ machineCount: 1000 }, { machineCount: -1 }, { machineCount: 0.1 }, { machineCount: '2' }, { favorite: 1 }, { note: 'x'.repeat(2001) }, { updatedAt: 'invalid' }, { storeId: '' }])('rejects malformed nested preference %j without usable partial state', (patch) => {
    const result = validateBackup({ ...backup(), storePreferences: [{ ...preference, ...patch }] }, catalog);
    expect(result.ok).toBe(false); expect('value' in result).toBe(false);
  });
  it('rejects duplicated stores/events and invalid history references', () => {
    expect(validateStorePreferences([preference, preference]).ok).toBe(false);
    expect(validateHistory([event, event], catalog).ok).toBe(false);
    expect(validateHistory([{ ...event, changes: [{ kind: 'inventory', targetId: 'missing', before, after }] }], catalog).ok).toBe(false);
  });
});

describe('history graph and action semantics', () => {
  it('accepts historical undo and reimported history without granting live undo', () => {
    expect(validateHistory([undo, event], catalog).ok).toBe(true);
    const imported = [event, undo].map((item) => ({ ...item, importedFromId: `old-${item.id}` }));
    expect(validateHistory(imported, catalog).ok).toBe(true);
    expect(canUndoLatest(imported[1], imported)).toBe(false);
  });
  it.each(['missing', 'undo'])('rejects dangling/self undo reference %s', (undoOf) => expect(validateHistory([event, { ...undo, undoOf }], catalog).ok).toBe(false));
  it('rejects forward references, repeated undo and mismatched inverses', () => {
    expect(validateHistory([{ ...event, sequence: 3 }, undo], catalog).ok).toBe(false);
    expect(validateHistory([event, undo, { ...undo, id: 'again', sequence: 3 }], catalog).ok).toBe(false);
    expect(validateHistory([event, { ...undo, changes: event.changes }], catalog).ok).toBe(false);
    const restore = { ...event, action: 'restore' as const };
    expect(validateHistory([restore, undo], catalog).ok).toBe(false);
  });
  it.each(['offered', 'wanted', 'store'] as const)('rejects owned changes recorded as %s', (action) => expect(validateHistory([{ ...event, action }], catalog).ok).toBe(false));
  it('allows owned decrement clamping offered, but rejects unrelated wanted change', () => {
    const change = { kind: 'inventory' as const, targetId: 'a', before: { ...before, owned: 3, offered: 2 }, after: { ...before, offered: 1 } };
    expect(validateHistory([{ ...event, changes: [change] }], catalog).ok).toBe(true);
    expect(validateHistory([{ ...event, changes: [{ ...change, after: { ...change.after, wanted: true } }] }], catalog).ok).toBe(false);
  });
  it('requires exact store inverse including updatedAt', () => {
    const store: HistoryEvent = { ...event, action: 'store', changes: [{ kind: 'store', targetId: preference.storeId, before: null, after: preference }] };
    const reverse: HistoryEvent = { ...undo, changes: [{ kind: 'store', targetId: preference.storeId, before: preference, after: null }] };
    expect(validateHistory([store, reverse], catalog).ok).toBe(true);
    expect(validateHistory([store, { ...reverse, changes: [{ ...reverse.changes[0], before: { ...preference, updatedAt: '2026-10-07T00:00:00Z' } }] }], catalog).ok).toBe(false);
  });
});

describe('safe latest undo', () => {
  it('only enables latest normal local action', () => {
    expect(canUndoLatest(event, [event])).toBe(true);
    expect(canUndoLatest(event, [event, undo])).toBe(false);
    expect(canUndoLatest(undo, [event, undo])).toBe(false);
    expect(canUndoLatest({ ...event, action: 'restore' }, [{ ...event, action: 'restore' }])).toBe(false);
  });
  it('returns independent values and rejects current-after mismatch without mutating input', () => {
    const state = { inventory: [after], storePreferences: [preference] };
    const snapshot = JSON.stringify(state);
    const result = applyUndo(event, state);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.inventory).toEqual([before]); result.value.inventory[0].owned = 9; }
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(applyUndo(event, { ...state, inventory: [before] }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
