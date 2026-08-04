export default function ErrorMessage({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="p-4 bg-error/8 border border-error/15 text-error rounded-xl flex items-start gap-3 mb-4">
      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 text-sm font-medium">{message}</div>
      {onClose && (
        <button onClick={onClose} className="text-error/50 hover:text-error transition-opacity cursor-pointer text-lg leading-none" aria-label="Fermer">
          &times;
        </button>
      )}
    </div>
  );
}
