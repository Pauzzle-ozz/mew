export default function Alert({
  variant = 'info',
  children,
  onClose,
  className = '',
}) {
  const styles = {
    success: 'bg-success/8 border-success/20 text-success',
    error: 'bg-error/8 border-error/20 text-error',
    warning: 'bg-warning/8 border-warning/20 text-warning',
    info: 'bg-info/8 border-info/20 text-info',
  };

  const icons = {
    success: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[variant]} ${className}`}>
      {icons[variant]}
      <div className="flex-1 text-sm font-medium">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer text-lg leading-none"
          aria-label="Fermer"
        >
          &times;
        </button>
      )}
    </div>
  );
}
