import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { parseBackup, type Backup, type CatalogCard, type Inventory } from '@aikatsu/domain';
import { CATALOG_CARDS, CATALOG_SETS, CATALOG_RELEASE, getSetCards } from './catalog';
import { loadInventory, normalizeInventory, saveInventory } from './storage';
import { CARD_IMAGES_ENABLED, cardImageUrl } from './publication';

type Page = 'cards' | 'exchange' | 'backup';
type Filter = 'all' | 'owned' | 'unowned' | 'offered' | 'wanted';
type Notice = { kind: 'success' | 'error'; text: string };
type Adjustment = { card: CatalogCard; next: Inventory };
type ImportPreview = { filename: string; inventory: Inventory[] };

const countFormat = new Intl.NumberFormat('ja-JP');
const count = (value: number | bigint) => countFormat.format(value);
function summarize(inventory: Inventory[]) {
  return {
    kinds: inventory.filter((item) => item.owned > 0).length,
    total: inventory.reduce((sum, item) => sum + BigInt(item.owned), 0n),
    offered: inventory.reduce((sum, item) => sum + BigInt(item.offered), 0n),
    wanted: inventory.filter((item) => item.wanted).length,
  };
}

function Sparkle({ className = '' }: { className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 14.6 9.4 22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

function Modal({ title, children, busy, onClose }: { title: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <p className="eyebrow">PLEASE CONFIRM</p>
    <h2 id="dialog-title">{title}</h2>
    {children}
  </dialog>;
}

function CardArtwork({ card }: { card: CatalogCard }) {
  const [back, setBack] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const imageUrl = cardImageUrl(back ? card.imageBackUrl : card.imageUrl);
  const unavailable = !imageUrl || failedImages.includes(imageUrl);
  return <div className="card-artwork">
    {unavailable ? <div className="card-image-fallback"><Sparkle /><span>{card.number}</span><small>{CARD_IMAGES_ENABLED ? '画像を表示できません' : 'テスト公開では画像を掲載していません'}</small></div> : <a href={imageUrl} target="_blank" rel="noreferrer" aria-label={`${card.number} カード${back ? '裏面' : '表面'}の画像を開く`}><img src={imageUrl} alt={`${card.number} のカード${back ? '裏面' : '表面'}`} loading="lazy" width="240" height="336" onError={() => setFailedImages((urls) => [...urls, imageUrl])} /></a>}
    {CARD_IMAGES_ENABLED && card.imageBackUrl && <button type="button" className="image-side-button" aria-label={`${card.number} カードの${back ? '表面' : '裏面'}を表示`} onClick={() => setBack((value) => !value)}>{back ? '表面を見る' : '裏面を見る'}</button>}
  </div>;
}

function Quantity({ card, label, value, max, disabled, change }: { card: CatalogCard; label: '所持' | '譲れる枚数'; value: number; max: number; disabled: boolean; change: (delta: number) => void }) {
  const actionLabel = label === '所持' ? '所持' : '譲れる枚数';
  return <div className="quantity">
    <span className="quantity-label">{label}</span>
    <div className="stepper">
      <button type="button" aria-label={`${card.number} ${actionLabel}を減らす`} disabled={disabled || value === 0} onClick={() => change(-1)}>−</button>
      <output aria-label={`${card.number} ${actionLabel}`}>{count(value)}<span>枚</span></output>
      <button type="button" aria-label={`${card.number} ${actionLabel}を増やす`} disabled={disabled || value >= max} onClick={() => change(1)}>+</button>
    </div>
  </div>;
}

export function App() {
  const [page, setPage] = useState<Page>('cards');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [setId, setSetId] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [part, setPart] = useState('all');
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const operationLock = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotice(null);
    loadInventory().then((value) => {
      if (active) { setInventory(value); setReady(true); }
    }).catch((error: unknown) => {
      if (active) setNotice({ kind: 'error', text: `データを読み込めませんでした。${error instanceof Error ? error.message : ''} 保存先は変更していません。` });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  async function commit(next: Inventory[], success: string): Promise<boolean> {
    if (!ready || operationLock.current) return false;
    operationLock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await saveInventory(next);
      setInventory(next);
      setNotice({ kind: 'success', text: success });
      return true;
    } catch (error: unknown) {
      setNotice({ kind: 'error', text: `保存できませんでした。変更は反映していません。${error instanceof Error ? error.message : 'ブラウザの保存設定を確認してください。'}` });
      return false;
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function updateItem(next: Inventory) {
    return commit(inventory.map((item) => item.cardId === next.cardId ? next : item), '端末内に保存しました。');
  }

  function changeOwned(card: CatalogCard, item: Inventory, delta: number) {
    const owned = item.owned + delta;
    if (!Number.isSafeInteger(owned) || owned < 0) return;
    const next = { ...item, owned };
    if (owned < item.offered) { setAdjustment({ card, next: { ...next, offered: owned } }); return; }
    void updateItem(next);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !ready || operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = parseBackup(await file.text(), CATALOG_CARDS);
      if (!result.ok) {
        setNotice({ kind: 'error', text: `取り込めませんでした。データは変更していません。\n${result.errors.join('\n')}` });
        return;
      }
      setPreview({ filename: file.name, inventory: normalizeInventory(result.value) });
    } catch {
      setNotice({ kind: 'error', text: 'ファイルを読み込めませんでした。データは変更していません。' });
    } finally { operationLock.current = false; setBusy(false); }
  }

  function downloadBackup() {
    const backup: Backup = { schemaVersion: 1, inventory };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `encore-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ kind: 'success', text: 'バックアップのダウンロードを開始しました。ファイルを大切に保管してください。' });
  }

  const selectedSet = CATALOG_SETS.find((set) => set.id === setId);
  const scopeCards = [...new Map((setId === 'all' ? CATALOG_SETS.flatMap((set) => getSetCards(set.id)) : getSetCards(setId)).map((card) => [card.id, card])).values()]
    .sort((a, b) => a.number.localeCompare(b.number, 'ja', { numeric: true }));
  const scopeIds = new Set(scopeCards.map((card) => card.id));
  const scopeInventory = inventory.filter((item) => scopeIds.has(item.cardId));
  const inventoryById = new Map(inventory.map((item) => [item.cardId, item]));
  const stats = summarize(scopeInventory);
  const allStats = summarize(inventory);
  const scopeName = selectedSet?.name ?? '全公開カード';
  const coverageComplete = (selectedSet ? [selectedSet] : CATALOG_SETS).every((set) => set.coverageStatus === 'complete');
  const unknownNames = scopeCards.filter((card) => card.name === '名称未確認').length;
  const rarities = [...new Set(scopeCards.flatMap((card) => card.rarity ? [card.rarity] : []))];
  const parts = [...new Set(scopeCards.flatMap((card) => card.part ? [card.part] : []))];
  const disabled = !ready || busy;
  const normalizedQuery = query.trim().normalize('NFKC').toLocaleLowerCase('ja');
  const visibleCards = scopeCards.filter((card) => {
    const item = inventoryById.get(card.id);
    if (!item) return false;
    if (page === 'exchange' && !item.wanted && item.offered === 0) return false;
    if (rarity !== 'all' && card.rarity !== rarity) return false;
    if (part !== 'all' && card.part !== part) return false;
    if (normalizedQuery && !`${card.number} ${card.name}`.normalize('NFKC').toLocaleLowerCase('ja').includes(normalizedQuery)) return false;
    return filter === 'all' || (filter === 'owned' && item.owned > 0) || (filter === 'unowned' && item.owned === 0) || (filter === 'offered' && item.offered > 0) || (filter === 'wanted' && item.wanted);
  });
  const previewStats = preview ? summarize(preview.inventory) : null;

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="#main" aria-label="Encore カードノート"><span className="brand-mark"><Sparkle /></span><span>Encore<span className="brand-sub">カードノート</span></span></a>
      <span className="local-badge"><span /> {CARD_IMAGES_ENABLED ? 'LOCAL TEST' : 'TEST PREVIEW'}</span>
    </header>

    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div><p className="eyebrow">YOUR LITTLE CARD COLLECTION</p><h1 id="hero-title">きょうの一枚を、<br />コレクションに。</h1><p className="hero-description">所持・譲れる・欲しいを、ひとつのノートに。</p></div>
        <div className="hero-decoration" aria-hidden="true"><div className="mini-card back"><Sparkle /></div><div className="mini-card front"><Sparkle /><span>MY<br />COLLECTION</span><small>01 / 02</small></div><Sparkle className="floating-star" /></div>
      </section>
      <section className="catalog-scope" aria-label="カタログの収録範囲"><div className="scope-note"><span className="scope-label">{scopeName} · {scopeCards.length} 種</span><span>{coverageComplete ? '公式公開一覧を収録' : '収録済み範囲の集計'} · 取得 {(selectedSet?.fetchedAt ?? CATALOG_RELEASE.acquiredAt).slice(0, 10)}</span></div><label className="set-picker"><span>収録範囲</span><select value={setId} onChange={(event) => { setSetId(event.target.value); setRarity('all'); setPart('all'); }}><option value="all">全公開カード</option>{CATALOG_SETS.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label><div className="catalog-source">出典：{(selectedSet ? [selectedSet] : CATALOG_SETS).map((set, index) => <span key={set.id}>{index > 0 && ' / '}<a href={set.sourceUrl} target="_blank" rel="noreferrer">公式 {set.name}</a></span>)}<span className="catalog-version">カタログ {CATALOG_RELEASE.catalogVersion}</span></div>{unknownNames > 0 && <p className="metadata-note">{unknownNames} 種の名称は未確認です。画像やカード番号で確認・管理できます。</p>}</section>
      <section className="stats" aria-label="コレクションの集計">
        <div className="stat-card"><span>所持種類</span><div><strong>{ready ? stats.kinds : '—'}</strong><span> / {scopeCards.length} 種</span></div><div className="progress-track" role="progressbar" aria-label={`${scopeName}の所持種類率`} aria-valuenow={ready ? stats.kinds : 0} aria-valuemin={0} aria-valuemax={scopeCards.length}><span style={{ width: `${ready ? (scopeCards.length ? stats.kinds / scopeCards.length * 100 : 0) : 0}%` }} /></div><small>{scopeName}の収録済み範囲</small></div>
        <div className="stat-card"><span>総所持枚数</span><div><strong>{ready ? count(stats.total) : '—'}</strong><span> 枚</span></div><small>同じカードの複数枚もカウント</small></div>
        <div className="stat-card exchange-stat"><span>わたしの譲・求</span><div><span>譲 </span><strong>{ready ? count(stats.offered) : '—'}</strong><span> 枚</span><span className="stat-separator">/</span><span>求 </span><strong>{ready ? stats.wanted : '—'}</strong><span> 種</span></div><small>自分の端末内で整理できます</small></div>
      </section>

      <nav className="page-nav" aria-label="メインメニュー">
        {([{ id: 'cards', label: 'カード', symbol: '▤' }, { id: 'exchange', label: '譲・求', symbol: '⇄' }, { id: 'backup', label: 'バックアップ', symbol: '↓' }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={page === tab.id} onClick={() => { setPage(tab.id); setFilter('all'); }}><span aria-hidden="true">{tab.symbol}</span>{tab.label}</button>)}
      </nav>

      {loading && <p role="status" className="notice">端末内のデータを読み込んでいます…</p>}
      {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}{!ready && !loading && <button type="button" className="text-button" onClick={() => setLoadAttempt((value) => value + 1)}>再読み込み</button>}</div>}
      {busy && <p role="status" className="saving-status">処理しています…</p>}

      {page !== 'backup' ? <section aria-labelledby="list-title" className="collection-panel">
        <div className="section-heading"><div><p className="eyebrow">{page === 'cards' ? 'CARD LIBRARY' : 'MY WISH & OFFER'}</p><h2 id="list-title">{page === 'cards' ? 'カード一覧' : 'わたしの譲・求'}</h2></div><span className="result-count">{visibleCards.length} / {scopeCards.length} 種表示<span> · 番号順</span></span></div>
        {page === 'exchange' && <p className="panel-description">譲れる枚数または欲しいが登録されたカードを表示します。友人への共有・同期は未対応です。</p>}
        <div className="toolbar"><label className="search-field"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span className="sr-only">カード名・番号で検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名・番号で検索" /></label><label className="filter-field"><span className="sr-only">カードの絞り込み</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">すべて</option><option value="owned">所持</option><option value="unowned">未所持</option><option value="offered">譲れる</option><option value="wanted">欲しい</option></select></label></div>
        <div className="metadata-filters">{rarities.length > 1 && <label><span>レアリティ</span><select value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="all">すべて</option>{rarities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}{parts.length > 1 && <label><span>パーツ</span><select value={part} onChange={(event) => setPart(event.target.value)}><option value="all">すべて</option>{parts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
        <div className="card-list">{visibleCards.map((card) => {
          const item = inventoryById.get(card.id)!;
          return <article key={card.id} aria-label={`${card.number} ${card.name}`} data-testid={`card-${card.id}`} className="inventory-card">
            <CardArtwork card={card} />
            <div className="card-main"><div className="card-meta"><span className="card-number">{card.number}</span>{card.rarity && <span className="rarity">{card.rarity}</span>}<span className={`ownership-label ${item.owned > 0 ? 'is-owned' : ''}`}>{item.owned > 0 ? '所持' : '未所持'}</span></div><h3>{card.name}</h3><p className="card-source">{[card.part, card.brand, card.category, card.appealPoints !== undefined ? `AP ${count(card.appealPoints)}` : undefined].filter(Boolean).join(' · ') || '公式カード一覧'}</p>{card.metadata.availabilityText && <p className="card-availability">{card.metadata.availabilityText}</p>}
              <div className="card-controls"><Quantity card={card} label="所持" value={item.owned} max={Number.MAX_SAFE_INTEGER} disabled={disabled} change={(delta) => changeOwned(card, item, delta)} /><Quantity card={card} label="譲れる枚数" value={item.offered} max={item.owned} disabled={disabled} change={(delta) => { void updateItem({ ...item, offered: item.offered + delta }); }} /><label className={`wanted-control ${item.wanted ? 'is-wanted' : ''}`}><input type="checkbox" aria-label={`${card.number} 欲しい`} checked={item.wanted} disabled={disabled} onChange={(event) => { void updateItem({ ...item, wanted: event.target.checked }); }} /><span aria-hidden="true">♡</span><span>欲しい</span></label></div>
            </div>
          </article>;
        })}</div>
        {ready && visibleCards.length === 0 && <div className="empty-state"><Sparkle /><h3>{page === 'exchange' && !query && filter === 'all' ? '譲・求はまだありません' : '一致するカードがありません'}</h3><p>{page === 'exchange' && !query && filter === 'all' ? 'カード一覧で「譲れる枚数」や「欲しい」を登録してみましょう。' : '検索語や絞り込みを変えてみてください。'}</p></div>}
      </section> : <section className="backup-panel" aria-labelledby="backup-title">
        <div className="section-heading"><div><p className="eyebrow">KEEP YOUR COLLECTION SAFE</p><h2 id="backup-title">バックアップ</h2></div><Sparkle /></div>
        <p className="panel-description">カードの所持枚数・譲れる枚数・欲しい状態を、JSONファイルにまとめて保存・復元できます。</p>
        <div className="backup-actions"><article><span className="action-icon" aria-hidden="true">↓</span><h3>ファイルに保存</h3><p>ブラウザのデータを消す前や、別の端末に移る前に保存してください。</p><button type="button" className="primary-button" disabled={disabled} onClick={downloadBackup}>JSONをダウンロード</button></article><article><span className="action-icon lilac-icon" aria-hidden="true">↑</span><h3>ファイルから復元</h3><p>全件を検証して、変更内容を確認してから現在のデータを置き換えます。</p><label className="file-picker"><span>JSONファイルを選択</span><input type="file" accept=".json,application/json" aria-label="バックアップJSONファイル" disabled={disabled} onChange={(event) => { void importFile(event); }} /></label></article></div>
        <aside className="storage-note"><h3>全収録範囲のデータをバックアップ</h3><p>弾・検索・絞り込みにかかわらず、全登録カードの所持・譲求を保存します。通常のカタログ更新では既存の値を保ち、新カードだけ0から追加します。旧形式（schemaVersion: 1）のバックアップも復元できます。</p><h3>このブラウザだけに保存されます</h3><p>保存先はIndexedDBです。ブラウザ・端末・URLのホスト名やポートが変わると別の保存先になります。ブラウザのデータ消去でも失われるため、定期的にバックアップしてください。</p><p>ログイン・クラウド保存・友人との同期・QR読取はありません。ローカルサーバーを起動して使うテスト版です。</p></aside>
      </section>}
      <footer className="site-footer"><span>Encore · わたしのカードノート</span><span>カードデータ・画像の出典：<a href={CATALOG_RELEASE.sourceUrls[0]} target="_blank" rel="noreferrer">アイカツアンコール公式サイト</a></span></footer>
    </main>

    {adjustment && <Modal title="譲れる枚数も調整しますか？" busy={busy} onClose={() => setAdjustment(null)}><p>{adjustment.card.number} {adjustment.card.name}</p><p>所持を {count(adjustment.next.owned)} 枚に減らすと、譲れる枚数が所持枚数を超えます。所持と譲れる枚数を、ともに {count(adjustment.next.owned)} 枚に変更します。</p><p className="modal-note">確認するまで現在のデータは変わりません。</p><div className="modal-actions"><button autoFocus type="button" className="secondary-button" disabled={busy} onClick={() => setAdjustment(null)}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={() => { void updateItem(adjustment.next).then((ok) => { if (ok) setAdjustment(null); }); }}>調整して保存</button></div>{notice?.kind === 'error' && <p role="alert" className="notice error">{notice.text}</p>}</Modal>}
    {preview && previewStats && <Modal title="バックアップを復元しますか？" busy={busy} onClose={() => setPreview(null)}><p className="filename">{preview.filename}</p><p>検証に成功しました。表示範囲にかかわらず、全登録 {CATALOG_CARDS.length} 種のデータを以下の内容に置き換えます。ファイルにないカードは未所持・譲0枚・欲しい未選択になります。</p><dl className="preview-counts"><div><dt>所持種類</dt><dd>{previewStats.kinds} / {CATALOG_CARDS.length} 種</dd></div><div><dt>総所持枚数</dt><dd>{count(previewStats.total)} 枚</dd></div><div><dt>譲れる枚数</dt><dd>{count(previewStats.offered)} 枚</dd></div><div><dt>欲しい</dt><dd>{previewStats.wanted} 種</dd></div></dl><p className="modal-note">現在（全登録）: 所持 {allStats.kinds} 種 / {count(allStats.total)} 枚 · 譲 {count(allStats.offered)} 枚 · 求 {allStats.wanted} 種</p><div className="modal-actions"><button autoFocus type="button" className="secondary-button" disabled={busy} onClick={() => setPreview(null)}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={() => { void commit(preview.inventory, 'バックアップを復元し、端末内に保存しました。').then((ok) => { if (ok) setPreview(null); }); }}>置き換えて復元</button></div>{notice?.kind === 'error' && <p role="alert" className="notice error">{notice.text}</p>}</Modal>}
  </div>;
}
