import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../../../apps/web/app/components/ui/modal";

export function DetailDrawer({ title, onClose, children, returnFocus }: { title: string | null; onClose: () => void; children: ReactNode; returnFocus: RefObject<HTMLElement | null> }) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useModal({ open: title !== null, panel, onClose, returnFocus });
  useEffect(() => { body.current?.scrollTo(0, 0); panel.current?.focus({ preventScroll: true }); }, [title]);
  if (!title || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="关闭详情遮罩" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="relative flex h-dvh w-full max-w-xl flex-col bg-surface shadow-xl outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-control border border-line px-3 py-2 text-sm">关闭详情</button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>, document.body,
  );
}
