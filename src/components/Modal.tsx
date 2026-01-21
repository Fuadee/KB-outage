import { ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200/70 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          {title ? (
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ปิด
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
