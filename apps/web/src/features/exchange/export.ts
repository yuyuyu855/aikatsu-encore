import type { CatalogCard, Inventory } from '@aikatsu/domain';
export type ExchangeEntry = { card: CatalogCard; quantity: number };
export function exchangeEntries(cards: readonly CatalogCard[], inventory: readonly Inventory[]) {
  const byId = new Map(inventory.map((item) => [item.cardId, item]));
  const wanted: ExchangeEntry[] = [], offered: ExchangeEntry[] = [];
  for (const card of cards) {
    const item = byId.get(card.id);
    if (item?.wanted) wanted.push({ card, quantity: 1 });
    if (item && item.offered > 0) offered.push({ card, quantity: item.offered });
  }
  return { wanted, offered };
}
export function exchangeText(scopeName: string, wanted: readonly ExchangeEntry[], offered: readonly ExchangeEntry[]) {
  const lines = (entries: readonly ExchangeEntry[], quantities: boolean) => entries.length ? entries.map(({ card, quantity }) => `${card.number} ${card.name}${card.rarity ? ` [${card.rarity}]` : ''}${quantities ? ` ×${quantity}枚` : ''}`).join('\n') : 'なし';
  return `${scopeName}\n\n【求】${wanted.length}種\n${lines(wanted, false)}\n\n【譲】${offered.length}種\n${lines(offered, true)}\n\nカード情報出典：アイカツアンコール公式カードリスト https://dcd.aikatsu.com/encore/cardlist/`;
}
export function exchangePageCount(wanted: readonly ExchangeEntry[], offered: readonly ExchangeEntry[]) {
  return Math.max(1, Math.ceil(wanted.length / 12), Math.ceil(offered.length / 12));
}
export function exchangePage(entries: readonly ExchangeEntry[], page: number) { return entries.slice(page * 12, (page + 1) * 12); }
function fit(ctx: CanvasRenderingContext2D, value: string, width: number) {
  if (ctx.measureText(value).width <= width) return value;
  let shortened = value;
  while (shortened && ctx.measureText(shortened + '…').width > width) shortened = shortened.slice(0, -1);
  return shortened + '…';
}
export async function renderExchangePng(scopeName: string, wanted: readonly ExchangeEntry[], offered: readonly ExchangeEntry[], page: number): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1360;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('画像作成に対応していないブラウザーです。');
  ctx.fillStyle = '#fffaf5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#392d41'; ctx.font = 'bold 36px sans-serif'; ctx.fillText('交換リスト', 48, 65);
  ctx.font = '24px sans-serif'; ctx.fillText(fit(ctx, scopeName, 870), 48, 108);
  ctx.fillText(`${page + 1} / ${exchangePageCount(wanted, offered)}`, 1030, 65);
  const section = (title: string, entries: readonly ExchangeEntry[], y: number, color: string, quantities: boolean) => {
    ctx.fillStyle = color; ctx.fillRect(40, y, 1120, 55); ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(`${title}  ${entries.length}種`, 60, y + 38);
    const items = exchangePage(entries, page);
    if (!items.length) { ctx.fillStyle = '#6e6570'; ctx.font = '24px sans-serif'; ctx.fillText('このページにはありません', 60, y + 108); }
    items.forEach(({card, quantity}, index) => {
      const x = 40 + index % 3 * 378, top = y + 72 + Math.floor(index / 3) * 112;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, top, 364, 100);
      ctx.fillStyle = '#392d41'; ctx.font = 'bold 23px sans-serif'; ctx.fillText(fit(ctx, card.number, 340), x + 12, top + 29);
      ctx.font = '22px sans-serif'; ctx.fillText(fit(ctx, card.name, 340), x + 12, top + 59);
      ctx.font = '19px sans-serif'; ctx.fillStyle = '#74616f'; ctx.fillText(fit(ctx, `${card.rarity ?? ''}${quantities ? `  ×${quantity}枚` : ''}`, 340), x + 12, top + 86);
    });
  };
  section('求', wanted, 145, '#a15a91', false); section('譲', offered, 720, '#527c80', true);
  ctx.fillStyle = '#665e65'; ctx.font = '20px sans-serif'; ctx.fillText(fit(ctx, 'カード情報出典：アイカツアンコール公式カードリスト https://dcd.aikatsu.com/encore/cardlist/', 1120), 40, 1300);
  ctx.fillText('カード画像を含まない交換用リスト', 40, 1330);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGを作成できませんでした。')), 'image/png'));
}
