import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Inventory } from '@aikatsu/domain';

const countFormat = new Intl.NumberFormat('ja-JP');
export const count = (value: number | bigint) => countFormat.format(value);
export function summarize(inventory: readonly Inventory[]) {
  return {
    kinds: inventory.filter((item) => item.owned > 0).length,
    total: inventory.reduce((sum, item) => sum + BigInt(item.owned), 0n),
    offered: inventory.reduce((sum, item) => sum + BigInt(item.offered), 0n),
    wanted: inventory.filter((item) => item.wanted).length,
  };
}

export function Sparkle({ className = '' }: { className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 14.6 9.4 22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export function Modal({ title, children, busy, onClose }: { title: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <p className="eyebrow">PLEASE CONFIRM</p><h2 id={titleId}>{title}</h2>{children}
  </dialog>;
}
