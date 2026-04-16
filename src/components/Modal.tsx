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
          "relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/80",
          cardDark,
          panelClassName
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700/70 px-4 py-3 sm:px-5">
          {title ? (
            <h2 className={cn("text-lg sm:text-xl", titleText)}>{title}</h2>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-200/80 hover:text-white"
          >
            ปิด
          </button>
        </div>
        {onSubmit ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4",
                bodyClassName
              )}
            >
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-slate-700/70 bg-slate-900/95 px-4 py-3 sm:px-5">
                {footer}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4",
                bodyClassName
              )}
            >
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-slate-700/70 bg-slate-900/95 px-4 py-3 sm:px-5">
                {footer}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
