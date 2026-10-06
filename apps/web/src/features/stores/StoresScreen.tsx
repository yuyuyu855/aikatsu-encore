import { useEffect, useMemo, useState } from 'react';
import { emptyStorePreference, filterStores, storeCatalog, storeMapUrl, storePrefectures, type OfficialStore, type PersonalStorePreference } from './catalog';
import './stores.css';
export interface StoresScreenProps {
  preferences: Readonly<Record<string, PersonalStorePreference>>;
  onUpdateStore: (id: string, patch: Partial<PersonalStorePreference>) => Promise<boolean>;
}
function StoreCard({ store, preference, onUpdateStore }: { store: OfficialStore; preference: PersonalStorePreference; onUpdateStore: StoresScreenProps['onUpdateStore'] }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function persist(patch: Partial<PersonalStorePreference>) {
    setSaving(true); setError('');
    try {
      const saved = await onUpdateStore(store.id, patch);
      if (!saved) setError('保存できませんでした。入力を残しています。もう一度お試しください。');
      return saved;
    } catch { setError('保存できませんでした。入力を残しています。もう一度お試しください。'); return false; }
    finally { setSaving(false); }
  }
  function edit() { setNote(preference.note); setCount(preference.machineCount === null ? '' : String(preference.machineCount)); setError(''); setEditing(true); }
  async function save() {
    if (count && (!/^\d+$/.test(count) || Number(count) > 999)) { setError('台数は0〜999の整数で入力してください。未確認なら空欄にできます。'); return; }
    if (await persist({ note, machineCount: count === '' ? null : Number(count) })) setEditing(false);
  }
  return <article className="store-card">
    <div className="store-card-top"><div><span className="store-prefecture">{store.prefecture}</span><h2>{store.name}</h2></div><button className={`store-favorite ${preference.favorite ? 'is-favorite' : ''}`} type="button" aria-label={`${store.name}を${preference.favorite ? 'お気に入りから解除' : 'お気に入りに登録'}`} aria-pressed={preference.favorite} disabled={saving} onClick={() => { void persist({ favorite: !preference.favorite }); }}>{preference.favorite ? '★' : '☆'}</button></div>
    <p className="store-address">{store.address}</p>
    <p className="store-count">設置台数：{preference.machineCount === null ? '未確認' : `${preference.machineCount}台（自分の記録）`}</p>
    {preference.note && <p className="store-note">{preference.note}</p>}
    <div className="store-actions"><a href={storeMapUrl(store)} target="_blank" rel="noopener noreferrer">地図 ↗</a><a href={storeMapUrl(store, true)} target="_blank" rel="noopener noreferrer">ルート ↗</a><button type="button" disabled={saving} onClick={edit}>記録する</button></div>
    {editing && <div className="store-editor"><p>この端末に保存する自分用の記録です。</p><label>設置台数（未確認なら空欄）<input type="number" min="0" max="999" step="1" inputMode="numeric" value={count} disabled={saving} onChange={event => setCount(event.target.value)} /></label><label>メモ<textarea maxLength={2000} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="訪問した日、設置場所など" /></label><div className="store-actions"><button type="button" disabled={saving} onClick={() => { void save(); }}>{saving ? '保存中…' : '保存する'}</button><button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>キャンセル</button></div></div>}
    {error && <p className="store-error" role="alert">{error}</p>}
  </article>;
}
export function StoresScreen({ preferences, onUpdateStore }: StoresScreenProps) {
  const [query, setQuery] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => { setVisibleCount(50); }, [query, prefecture, favoritesOnly]);
  const stores = useMemo(() => filterStores(query, prefecture, favoritesOnly, preferences), [query, prefecture, favoritesOnly, preferences]);
  const favorites = storeCatalog.stores.filter(store => preferences[store.id]?.favorite).length;
  return <section className="stores-screen" aria-labelledby="stores-title"><div className="stores-heading"><h1 id="stores-title">設置店舗</h1><p>アイカツ！アンコールの取扱店舗を探す</p></div><p className="stores-source"><a href={storeCatalog.sourceUrl} target="_blank" rel="noopener noreferrer">公式店舗一覧 ↗</a> · {storeCatalog.sourceAsOf.replaceAll('-', '/')} 時点 · 全国{storeCatalog.total.toLocaleString()}店舗<br />掲載状況は変更される場合があります。来店前に店舗へご確認ください。</p><div className="stores-filters"><label className="store-search">店舗名・住所で検索<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="店舗名や市区町村" /></label><label>都道府県<select value={prefecture} onChange={event => setPrefecture(event.target.value)}><option value="">全国</option>{storePrefectures.map(value => <option key={value}>{value}</option>)}</select></label><button className="stores-favorites-filter" type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(value => !value)}>★ お気に入りのみ（{favorites}）</button></div><p className="stores-result" role="status">{stores.length.toLocaleString()}店舗{prefecture && ` · ${prefecture}`}</p><p className="stores-personal-notice">★・台数・メモは自分用の記録です。公式一覧には設置台数が掲載されていないため、初期表示は「未確認」です。地図・ルートはGoogle マップを開きます。</p><div className="store-list">{stores.slice(0, visibleCount).map(store => <StoreCard key={store.id} store={store} preference={preferences[store.id] ?? emptyStorePreference} onUpdateStore={onUpdateStore} />)}</div>{stores.length > visibleCount && <button className="stores-load-more" type="button" onClick={() => setVisibleCount(value => value + 50)}>さらに50件表示（残り{(stores.length - visibleCount).toLocaleString()}店舗）</button>}{stores.length === 0 && <p className="stores-empty">条件に合う店舗がありません。検索条件を変更してください。</p>}</section>;
}
