"use client";

import { type FormEventHandler, type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cardDark, titleText } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  panelClassName?: string;
  bodyClassName?: string;
};

// Keep background isolation until the last modal closes (including nested
// dialogs). Preserve pre-existing inline styles and inert state on cleanup.
let openModalCount = 0;
let restoreEnvironment: (() => void) | undefined;

function isolateModalBackground() {
  if (openModalCount++ === 0) {
    const body = document.body;
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const workspaces = Array.from(
      document.querySelectorAll<HTMLElement>(".operations-workspace")
    ).map((element) => ({ element, inert: element.inert }));

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";
    workspaces.forEach(({ element }) => { element.inert = true; });

    restoreEnvironment = () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
      workspaces.forEach(({ element, inert }) => { element.inert = inert; });
    };
  }

  return () => {
    if (--openModalCount === 0) {
      restoreEnvironment?.();
      restoreEnvironment = undefined;
    }
  };
}

export default function Modal({
  isOpen,
  title,
  onClose,
  children,
  footer,
  onSubmit,
  panelClassName,
  bodyClassName
}: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    const restoreBackground = isolateModalBackground();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      restoreBackground();
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  // A body portal prevents page spacing (e.g. space-y-6), scroll containers,
  // and ancestor effects from affecting the fixed overlay's viewport bounds.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-modal-root>
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        role="presentation"
      />
      <div
        className={cn(
          "modal-surface relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200",
          cardDark,
          panelClassName
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          {title ? (
            <h2 className={cn("text-lg sm:text-xl", titleText)}>{title}</h2>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ปิด
          </button>
        </div>
        {onSubmit ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-5 py-4 text-slate-700 sm:px-6 sm:py-5",
                bodyClassName
              )}
            >
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                {footer}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-5 py-4 text-slate-700 sm:px-6 sm:py-5",
                bodyClassName
              )}
            >
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                {footer}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
