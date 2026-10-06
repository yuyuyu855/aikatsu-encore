import { useEffect, useRef, useState } from 'react';
import type { CatalogCard, Inventory } from '@aikatsu/domain';
import { cardImageUrl } from '../../publication';
import { exchangeEntries, exchangePageCount, exchangeText, renderExchangePng, type ExchangeEntry } from './export';
import './exchange.css';

export interface ExchangePanelProps { cards: readonly CatalogCard[]; inventory: readonly Inventory[]; scopeName: string }
function ExchangeList({ title, entries, offered }: { title: string; entries: ExchangeEntry[]; offered?: boolean }) {
  return <section className="exchange-list"><h3>{title} <small>{entries.length}種</small></h3>{entries.length ? <ul>{entries.map(({card, quantity}) => <li key={card.id}>{cardImageUrl(card.imageUrl) && <img src={cardImageUrl(card.imageUrl)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}<span><small>{card.number} {card.rarity}</small><strong>{card.name}</strong></span>{offered && <b>×{quantity}枚</b>}</li>)}</ul> : <p>登録されたカードはありません。</p>}</section>;
}
export function ExchangePanel({ cards, inventory, scopeName }: ExchangePanelProps) {
  const {wanted, offered} = exchangeEntries(cards, inventory);
  const text = exchangeText(scopeName, wanted, offered);
  const [notice, setNotice] = useState(''); const [fallback, setFallback] = useState(false); const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0); const [url, setUrl] = useState<string>(); const [blob, setBlob] = useState<Blob>(); const [busy, setBusy] = useState(false);
  const generation = useRef(0); const dialog = useRef<HTMLDialogElement>(null);
  const offeredTotal = offered.reduce((total, entry) => total + BigInt(entry.quantity), 0n).toLocaleString('ja-JP');
  const pages = exchangePageCount(wanted, offered); const empty = !wanted.length && !offered.length;
  useEffect(() => { const element = dialog.current; if (open) element?.showModal(); return () => element?.close(); }, [open]);
  useEffect(() => { generation.current++; setBlob(undefined); setUrl(undefined); setBusy(false); setPage((value) => Math.min(value, pages - 1)); }, [text, page, open, pages]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { generation.current++; }, []);
  async function copy() {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(text); setNotice('交換リストをコピーしました。'); setFallback(false); }
    catch { setFallback(true); setNotice('コピーできませんでした。下のテキストを選択してコピーしてください。'); }
  }
  async function generate() {
    const current = ++generation.current; setBusy(true); setNotice(''); setBlob(undefined); setUrl(undefined);
    try { const next = await renderExchangePng(scopeName, wanted, offered, page); if (generation.current !== current) return; setBlob(next); setUrl(URL.createObjectURL(next)); }
    catch (error) { if (generation.current === current) setNotice(error instanceof Error ? error.message : '画像を作成できませんでした。'); }
    finally { if (generation.current === current) setBusy(false); }
  }
  const file = blob ? new File([blob], `exchange-${page + 1}.png`, {type:'image/png'}) : undefined;
  let shareable = false; try { shareable = !!file && !!navigator.share && !!navigator.canShare?.({files:[file]}); } catch { /* Download remains available. */ }
  async function share() {
    if (!file) return;
    try { await navigator.share({files:[file], title:`${scopeName} 交換リスト`}); setNotice('画像を共有しました。'); }
    catch (error) { setNotice(error instanceof DOMException && error.name === 'AbortError' ? '共有をキャンセルしました。' : '共有できませんでした。「PNGを保存」をお使いください。'); }
  }
  return <div className="exchange-feature"><p>対象：<strong>{scopeName}</strong> · 求 {wanted.length}種 / 譲 {offered.length}種・{offeredTotal}枚</p><div className="exchange-actions"><button type="button" onClick={copy} disabled={empty}>テキストをコピー</button><button type="button" disabled={empty} onClick={() => { setPage(0); setOpen(true); setNotice(''); }}>交換リスト画像を作成</button></div>{notice && <p role="status">{notice}</p>}{fallback && <textarea aria-label="コピー用交換リスト" readOnly value={text} rows={10} onFocus={(event) => event.currentTarget.select()} />}<div className="exchange-lists"><ExchangeList title="求 · 欲しいカード" entries={wanted}/><ExchangeList title="譲 · 譲れるカード" entries={offered} offered/></div><p className="exchange-attribution">カード情報出典：<a href="https://dcd.aikatsu.com/encore/cardlist/" target="_blank" rel="noreferrer">アイカツアンコール公式カードリスト</a></p>{open && <dialog ref={dialog} className="exchange-dialog" aria-labelledby="exchange-image-title" onCancel={() => setOpen(false)}><h2 id="exchange-image-title">交換リスト画像</h2><p>対象：{scopeName}。求・譲それぞれ12種ずつ、全{pages}ページ。画像はカード番号・名前・レアリティ・譲れる枚数を掲載します。</p><label>ページ <select aria-label="画像のページ" value={page} onChange={(event) => setPage(Number(event.target.value))}>{Array.from({length: pages}, (_,index) => <option key={index} value={index}>{index + 1} / {pages}</option>)}</select></label><p>選択したページごとに画像を作成・保存してください。カード画像は共有画像に含みません。</p>{url ? <img className="exchange-preview" src={url} alt={`交換リスト ${page + 1}ページのプレビュー`}/> : <div className="exchange-preview-empty">「このページの画像を作成」でプレビューを表示</div>}<div className="exchange-actions"><button type="button" disabled={busy || empty} onClick={generate}>{busy ? '画像を作成中…' : 'このページの画像を作成'}</button>{url && <a className="exchange-save" href={url} download={`exchange-${page + 1}.png`}>PNGを保存</a>}{shareable && <button type="button" onClick={share}>画像を共有</button>}<button type="button" onClick={() => setOpen(false)}>閉じる</button></div>{notice && <p role="status">{notice}</p>}</dialog>}</div>;
}
