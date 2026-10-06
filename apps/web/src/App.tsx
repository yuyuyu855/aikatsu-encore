import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { canUndoLatest, parseBackup, type AppState, type Backup, type CatalogCard, type Inventory, type HistoryAction } from '@aikatsu/domain';
import { CATALOG_CARDS, CATALOG_SETS, CATALOG_RELEASE, getSetCards } from './catalog';
import { loadAppState, normalizeInventory, commitInventory, saveStorePreference, undoLatest, restoreBackup } from './storage';
import { CARD_IMAGES_ENABLED } from './publication';
import { CardsPage, type CardFilter } from './components/CardsPage';
import { CatalogOverview } from './components/CatalogOverview';
import { BackupPage } from './components/BackupPage';
import { HistoryPage } from './components/HistoryPage';
import { Modal, Sparkle, count, summarize } from './components/UI';
import { CoordinateView } from './features/coordinates/CoordinateView';
import { ExchangePanel } from './features/exchange/ExchangePanel';
import { StoresScreen } from './features/stores/StoresScreen';
import { storeCatalog, type PersonalStorePreference } from './features/stores/catalog';

type Page = 'cards' | 'exchange' | 'coordinates' | 'stores' | 'history' | 'backup';
type Notice = { kind: 'success' | 'error'; text: string };
type Adjustment = { card: CatalogCard; next: Inventory };
type ImportPreview = { filename: string; backup: Backup; inventory: Inventory[] };
const emptyState: AppState = { inventory: [], history: [], storePreferences: [], revision: 0 };
const storeNames = new Map(storeCatalog.stores.map((store) => [store.id, store.name]));
const tabs = [
  { id: 'cards', label: 'カード', symbol: '▤' }, { id: 'exchange', label: '譲・求', symbol: '⇄' },
  { id: 'coordinates', label: 'コーデ', symbol: '✧' }, { id: 'stores', label: 'お店', symbol: '⌂' },
  { id: 'history', label: '履歴', symbol: '◷' }, { id: 'backup', label: 'バックアップ', symbol: '↓' },
] as const;

export function App() {
  const [page, setPage] = useState<Page>('cards');
  const [filter, setFilter] = useState<CardFilter>('all');
  const [query, setQuery] = useState('');
  const [setId, setSetId] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [part, setPart] = useState('all');
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const operationLock = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const inventory = state.inventory;

  useEffect(() => {
    let active = true;
    setLoading(true); setReady(false); setNotice(null);
    loadAppState().then((value) => { if (active) { setState(value); setReady(true); } }).catch((error: unknown) => {
      if (active) setNotice({ kind: 'error', text: `データを読み込めませんでした。${error instanceof Error ? error.message : ''} 保存先は変更していません。` });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  async function perform(operation: () => Promise<AppState>, success: string): Promise<boolean> {
    if (!ready || loading || operationLock.current) return false;
    operationLock.current = true; setBusy(true); setNotice(null);
    try {
      const next = await operation(); setState(next); setNotice({ kind: 'success', text: success }); return true;
    } catch (error: unknown) {
      setNotice({ kind: 'error', text: `保存できませんでした。変更は反映していません。${error instanceof Error ? error.message : 'ブラウザの保存設定を確認してください。'}` }); return false;
    } finally { operationLock.current = false; setBusy(false); }
  }
  function updateItem(next: Inventory, action: Exclude<HistoryAction, 'store' | 'restore' | 'undo'>) {
    const nextInventory = inventory.map((item) => item.cardId === next.cardId ? next : item);
    return perform(() => commitInventory({ before: inventory, next: nextInventory, expectedRevision: state.revision, action }), '端末内に保存しました。');
  }
  function changeOwned(card: CatalogCard, item: Inventory, delta: number) {
    const owned = item.owned + delta;
    if (!Number.isSafeInteger(owned) || owned < 0) return;
    const next = { ...item, owned };
    if (owned < item.offered) { setAdjustment({ card, next: { ...next, offered: owned } }); return; }
    void updateItem(next, 'owned');
  }
  function updateStore(storeId: string, patch: Partial<PersonalStorePreference>) {
    const current = state.storePreferences.find((item) => item.storeId === storeId) ?? { storeId, favorite: false, machineCount: null, note: '' };
    const next = { storeId, favorite: patch.favorite ?? current.favorite, machineCount: patch.machineCount === undefined ? current.machineCount : patch.machineCount, note: patch.note ?? current.note };
    return perform(() => saveStorePreference(next, state.revision), 'お店の記録を端末内に保存しました。');
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !ready || loading || operationLock.current) return;
    operationLock.current = true; setBusy(true); setNotice(null);
    try {
      const result = parseBackup(await file.text(), CATALOG_CARDS);
      if (!result.ok) { setNotice({ kind: 'error', text: `取り込めませんでした。データは変更していません。\n${result.errors.join('\n')}` }); return; }
      setPreview({ filename: file.name, backup: result.value, inventory: normalizeInventory(result.value) });
    } catch { setNotice({ kind: 'error', text: 'ファイルを読み込めませんでした。データは変更していません。' }); }
    finally { operationLock.current = false; setBusy(false); }
  }
  function downloadBackup() {
    const backup: Backup = { schemaVersion: 2, inventory, history: state.history, storePreferences: state.storePreferences };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `encore-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ kind: 'success', text: 'バックアップのダウンロードを開始しました。ファイルを大切に保管してください。' });
  }

  const scopeCards = [...new Map((setId === 'all' ? CATALOG_SETS.flatMap((set) => getSetCards(set.id)) : getSetCards(setId)).map((card) => [card.id, card])).values()].sort((a, b) => a.number.localeCompare(b.number, 'ja', { numeric: true }));
  const scopeIds = new Set(scopeCards.map((card) => card.id));
  const scopeInventory = inventory.filter((item) => scopeIds.has(item.cardId));
  const inventoryById = new Map(inventory.map((item) => [item.cardId, item]));
  const scopeName = CATALOG_SETS.find((set) => set.id === setId)?.name ?? '全公開カード';
  const rarities = [...new Set(scopeCards.flatMap((card) => card.rarity ? [card.rarity] : []))];
  const parts = [...new Set(scopeCards.flatMap((card) => card.part ? [card.part] : []))];
  const disabled = !ready || loading || busy;
  const normalizedQuery = query.trim().normalize('NFKC').toLocaleLowerCase('ja');
  const visibleCards = scopeCards.filter((card) => {
    const item = inventoryById.get(card.id);
    if (!item || (rarity !== 'all' && card.rarity !== rarity) || (part !== 'all' && card.part !== part)) return false;
    if (normalizedQuery && !`${card.number} ${card.name}`.normalize('NFKC').toLocaleLowerCase('ja').includes(normalizedQuery)) return false;
    return filter === 'all' || (filter === 'owned' && item.owned > 0) || (filter === 'unowned' && item.owned === 0) || (filter === 'offered' && item.offered > 0) || (filter === 'wanted' && item.wanted);
  });
  const allStats = summarize(inventory);
  const previewStats = preview ? summarize(preview.inventory) : null;
  const cardPage = page === 'cards' || page === 'coordinates' || page === 'exchange';
  const latestEvent = state.history.reduce<typeof state.history[number] | undefined>((last, event) => !last || event.sequence > last.sequence ? event : last, undefined);
  const undoable = latestEvent && canUndoLatest(latestEvent, state.history);
  const undoAction = (eventId: string) => perform(() => undoLatest(eventId, state.revision), '直近の操作を元に戻し、端末内に保存しました。');
  const preferences = Object.fromEntries(state.storePreferences.map((preference) => [preference.storeId, preference]));

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#main" aria-label="Encore カードノート"><span className="brand-mark"><Sparkle /></span><span>Encore<span className="brand-sub">カードノート</span></span></a><span className="local-badge"><span /> {CARD_IMAGES_ENABLED ? 'LOCAL TEST' : 'TEST PREVIEW'}</span></header>
    <main id="main">
      {page === 'cards' && <section className="hero" aria-labelledby="hero-title"><div><p className="eyebrow">YOUR LITTLE CARD COLLECTION</p><h1 id="hero-title">きょうの一枚を、<br />コレクションに。</h1><p className="hero-description">所持・譲れる・欲しいを、ひとつのノートに。</p></div><div className="hero-decoration" aria-hidden="true"><div className="mini-card back"><Sparkle /></div><div className="mini-card front"><Sparkle /><span>MY<br />COLLECTION</span><small>CARD NOTE</small></div><Sparkle className="floating-star" /></div></section>}
      <nav className="page-nav" aria-label="メインメニュー">{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={page === tab.id} onClick={() => setPage(tab.id)}><span aria-hidden="true">{tab.symbol}</span>{tab.label}</button>)}</nav>
      {loading && <p role="status" className="notice">端末内のデータを読み込んでいます…</p>}
      {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}{notice.kind === 'success' && latestEvent && undoable && <button type="button" className="notice-undo" aria-label="直近の操作を元に戻す" disabled={disabled} onClick={() => { void undoAction(latestEvent.id); }}>元に戻す</button>}{notice.kind === 'error' && <button type="button" className="text-button" disabled={busy || loading} onClick={() => setLoadAttempt((value) => value + 1)}>再読み込み</button>}</div>}
      {busy && <p role="status" className="saving-status">処理しています…</p>}
      {cardPage && <CatalogOverview cards={scopeCards} inventory={scopeInventory} setId={setId} ready={ready} onSet={(value) => { setSetId(value); setRarity('all'); setPart('all'); }} />}
      {page === 'cards' && <CardsPage cards={visibleCards} inventory={inventoryById} totalCount={scopeCards.length} ready={ready} disabled={disabled} query={query} filter={filter} rarity={rarity} part={part} rarities={rarities} parts={parts} onQuery={setQuery} onFilter={setFilter} onRarity={setRarity} onPart={setPart} onOwned={changeOwned} onOffered={(item, delta) => { void updateItem({ ...item, offered: item.offered + delta }, 'offered'); }} onWanted={(item, wanted) => { void updateItem({ ...item, wanted }, 'wanted'); }} />}
      {page === 'coordinates' && <CoordinateView cards={CATALOG_CARDS} inventory={inventory} selectedSetId={setId} />}
      {page === 'exchange' && <ExchangePanel cards={scopeCards} inventory={inventory} scopeName={scopeName} />}
      {page === 'stores' && ready && <StoresScreen preferences={preferences} onUpdateStore={updateStore} />}
      {page === 'history' && <HistoryPage history={state.history} cards={CATALOG_CARDS} storeNames={storeNames} disabled={disabled} onUndo={undoAction} />}
      {page === 'backup' && <BackupPage disabled={disabled} onDownload={downloadBackup} onImport={(event) => { void importFile(event); }} />}
      <footer className="site-footer"><span>Encore · わたしのカードノート</span><span>カードデータ・画像の出典：<a href={CATALOG_RELEASE.sourceUrls[0]} target="_blank" rel="noreferrer">アイカツアンコール公式サイト</a></span></footer>
    </main>
    {adjustment && <Modal title="譲れる枚数も調整しますか？" busy={busy} onClose={() => setAdjustment(null)}><p>{adjustment.card.number} {adjustment.card.name}</p><p>所持を {count(adjustment.next.owned)} 枚に減らすと、譲れる枚数が所持枚数を超えます。所持と譲れる枚数を、ともに {count(adjustment.next.owned)} 枚に変更します。</p><p className="modal-note">確認するまで現在のデータは変わりません。</p><div className="modal-actions"><button autoFocus type="button" className="secondary-button" disabled={busy} onClick={() => setAdjustment(null)}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={() => { void updateItem(adjustment.next, 'adjust').then((ok) => { if (ok) setAdjustment(null); }); }}>調整して保存</button></div>{notice?.kind === 'error' && <p role="alert" className="notice error">{notice.text}</p>}</Modal>}
    {preview && previewStats && <Modal title="バックアップを復元しますか？" busy={busy} onClose={() => setPreview(null)}><p className="filename">{preview.filename}</p><p>検証に成功しました。表示範囲にかかわらず、全登録 {CATALOG_CARDS.length} 種の在庫を以下の内容に置き換えます。ファイルにないカードは未所持・譲0枚・欲しい未選択になります。</p><dl className="preview-counts"><div><dt>所持種類</dt><dd>{previewStats.kinds} / {CATALOG_CARDS.length} 種</dd></div><div><dt>総所持枚数</dt><dd>{count(previewStats.total)} 枚</dd></div><div><dt>譲れる枚数</dt><dd>{count(previewStats.offered)} 枚</dd></div><div><dt>欲しい</dt><dd>{previewStats.wanted} 種</dd></div></dl><p className="modal-note">現在（全登録）: 所持 {allStats.kinds} 種 / {count(allStats.total)} 枚 · 譲 {count(allStats.offered)} 枚 · 求 {allStats.wanted} 種</p>{preview.backup.schemaVersion === 2 ? <p className="restore-warning">履歴 {count(preview.backup.history.length)} 件・店舗設定 {count(preview.backup.storePreferences.length)} 件も入れ替えます。復元は取り消せません。</p> : <p className="restore-warning">旧v1形式：現在の履歴 {count(state.history.length)} 件・店舗設定 {count(state.storePreferences.length)} 件は保持します。復元は取り消せません。</p>}<div className="modal-actions"><button autoFocus type="button" className="secondary-button" disabled={busy} onClick={() => setPreview(null)}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={() => { void perform(() => restoreBackup(preview.backup, state.revision), 'バックアップを復元し、端末内に保存しました。').then((ok) => { if (ok) setPreview(null); }); }}>置き換えて復元</button></div>{notice?.kind === 'error' && <p role="alert" className="notice error">{notice.text}</p>}</Modal>}
  </div>;
}
