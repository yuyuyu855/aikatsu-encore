import { describe, expect, it } from 'vitest';
import { emptyInventory, parseBackup, validateBackup, validateInventory } from '../src/index';
import type { CatalogCard, Inventory } from '../src/index';

const catalog: readonly CatalogCard[] = [
  { id: 'first', number: 'test-1', name: 'テスト用カード1' },
  { id: 'second', number: 'test-2', name: 'テスト用カード2' },
];
const entry: Inventory = { cardId: 'first', owned: 2, offered: 1, wanted: true };
const backup = (inventory: unknown) => ({ schemaVersion: 1, inventory });

describe('inventory rules', () => {
  it('starts at zero with independent wanted state', () => {
    expect(emptyInventory('first')).toEqual({ cardId: 'first', owned: 0, offered: 0, wanted: false });
    expect(validateInventory({ ...entry, owned: 0, offered: 0, wanted: true }).ok).toBe(true);
    expect(validateInventory({ ...entry, offered: 2 }).ok).toBe(true);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', null])(
    'rejects invalid quantities %s in both counts',
    (quantity) => {
      expect(validateInventory({ ...entry, owned: quantity }).ok).toBe(false);
      expect(validateInventory({ ...entry, offered: quantity }).ok).toBe(false);
    },
  );

  it('accepts the largest safe integer', () => {
    expect(validateInventory({ ...entry, owned: Number.MAX_SAFE_INTEGER, offered: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });

  it('rejects offered above owned', () => {
    expect(validateInventory({ ...entry, owned: 1, offered: 2 }).ok).toBe(false);
  });

  it.each([null, [], 1, 'card', {}, { ...entry, cardId: ' ' }, { ...entry, wanted: 'true' }])(
    'rejects missing or incorrectly typed fields: %j',
    (value) => expect(validateInventory(value).ok).toBe(false),
  );
});

describe('complete backup validation', () => {
  it('parses valid backups, including empty or partial inventory', () => {
    expect(parseBackup(JSON.stringify(backup([entry])), catalog)).toEqual({ ok: true, value: backup([entry]) });
    expect(validateBackup(backup([]), catalog).ok).toBe(true);
  });

  it.each(['{broken', '', 'null', '[]', '42'])('rejects malformed or non-object JSON: %s', (text) => {
    expect(parseBackup(text, catalog).ok).toBe(false);
  });

  it.each([undefined, 0, 2, '1'])('rejects unsupported schema version %s', (schemaVersion) => {
    expect(validateBackup({ schemaVersion, inventory: [entry] }, catalog).ok).toBe(false);
  });

  it.each([undefined, null, {}, 'items'])('requires inventory to be an array: %j', (inventory) => {
    expect(validateBackup(backup(inventory), catalog).ok).toBe(false);
  });

  it('rejects duplicate card IDs', () => {
    const result = validateBackup(backup([entry, { ...entry, owned: 1 }]), catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('重複');
  });

  it('rejects a missing array element rather than skipping it', () => {
    expect(validateBackup(backup(new Array(1)), catalog).ok).toBe(false);
  });

  it('rejects unresolved card references without dropping them', () => {
    const result = validateBackup(backup([entry, { ...entry, cardId: 'unknown' }]), catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('unknown');
  });

  it('reports all invalid entries and returns no usable partial backup', () => {
    const value = backup([entry, { ...entry, owned: -1 }, { ...entry, cardId: 'unknown' }]);
    const before = JSON.stringify(value);
    const result = validateBackup(value, catalog);
    expect(result.ok).toBe(false);
    expect('value' in result).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('2件目');
      expect(result.errors.join(' ')).toContain('3件目');
    }
    expect(JSON.stringify(value)).toBe(before);
  });

  it('returns fresh validated fields without accepting unrelated file state', () => {
    const original = { ...entry, userId: 'external' };
    const result = validateBackup({ ...backup([original]), shared: true }, catalog);
    expect(result).toEqual({ ok: true, value: backup([entry]) });
    if (result.ok) {
      result.value.inventory[0].owned = 5;
      expect(original.owned).toBe(2);
    }
  });
});
