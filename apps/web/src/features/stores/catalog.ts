import snapshot from './data/stores.json';
export interface OfficialStore { id: string; name: string; prefecture: string; address: string; machineCount: number | null }
export interface PersonalStorePreference { favorite: boolean; note: string; machineCount: number | null }
export const storeCatalog = snapshot;
export const officialStores: readonly OfficialStore[] = snapshot.stores;
export const storePrefectures = Object.keys(snapshot.prefectureCounts);
export const emptyStorePreference: PersonalStorePreference = { favorite: false, note: '', machineCount: null };
export function filterStores(query: string, prefecture: string, favoritesOnly: boolean, preferences: Readonly<Record<string, PersonalStorePreference>>) {
  const term = query.normalize('NFKC').toLowerCase().trim();
  return officialStores.filter(store => (!prefecture || store.prefecture === prefecture) && (!favoritesOnly || preferences[store.id]?.favorite) && (!term || `${store.name} ${store.address}`.normalize('NFKC').toLowerCase().includes(term)));
}
export function storeMapUrl(store: OfficialStore, directions = false) {
  const destination = encodeURIComponent(`${store.name} ${store.address}`);
  return directions ? `https://www.google.com/maps/dir/?api=1&destination=${destination}` : `https://www.google.com/maps/search/?api=1&query=${destination}`;
}
