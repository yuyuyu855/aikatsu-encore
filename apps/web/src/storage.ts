import { emptyInventory, validateBackup, type Backup, type Inventory } from '@aikatsu/domain';
import { SAMPLE_CATALOG } from './catalog';

const DATABASE = 'aikatsu-encore-local';
const STORE = 'state';
const KEY = 'inventory';
let databasePromise: Promise<IDBDatabase> | undefined;

export function normalizeInventory(backup: Backup): Inventory[] {
  return SAMPLE_CATALOG.map((card) => backup.inventory.find((item) => item.cardId === card.id) ?? emptyInventory(card.id));
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('このブラウザでは端末内保存を利用できません。'));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => reject(request.error ?? new Error('保存先を開けませんでした。'));
      request.onblocked = () => reject(new Error('別のタブを閉じてから、再読み込みしてください。'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
    }).catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export async function loadInventory(): Promise<Inventory[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    transaction.onabort = () => reject(transaction.error ?? new Error('保存データを読み込めませんでした。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('保存データを読み込めませんでした。'));
    transaction.oncomplete = () => {
      if (request.result === undefined) {
        resolve(SAMPLE_CATALOG.map((card) => emptyInventory(card.id)));
        return;
      }
      const result = validateBackup(request.result, SAMPLE_CATALOG);
      if (!result.ok) {
        reject(new Error(`保存データに問題があります。上書きせず停止しました。${result.errors.join(' ')}`));
        return;
      }
      resolve(normalizeInventory(result.value));
    };
  });
}

/** A complete validated snapshot is replaced in one transaction. Resolve only on commit. */
export async function saveInventory(inventory: Inventory[]): Promise<void> {
  const backup: Backup = { schemaVersion: 1, inventory };
  const result = validateBackup(backup, SAMPLE_CATALOG);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('保存が中断されました。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('保存に失敗しました。'));
    transaction.objectStore(STORE).put(backup, KEY);
  });
}
