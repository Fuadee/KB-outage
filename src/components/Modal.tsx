import { type FormEventHandler, type ReactNode, useEffect } from "react";
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
  useEffect(() => {
    if (!isOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
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
    </div>
  );
}
