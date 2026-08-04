'use client';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-body font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer active:scale-[0.97]';

  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-hover rounded-full shadow-sm hover:shadow-md',
    secondary: 'bg-secondary text-white hover:bg-secondary-hover rounded-full',
    outline: 'border-2 border-border-light text-text-secondary hover:border-primary hover:text-primary rounded-full',
    ghost: 'text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded-lg',
    danger: 'bg-error/10 text-error border border-error/20 hover:bg-error/20 rounded-full',
    soft: 'bg-primary-light text-primary hover:bg-primary/15 rounded-full',
  };

  const sizeStyles = {
    sm: 'px-4 py-2 text-sm gap-1.5',
    md: 'px-6 py-2.5 text-sm gap-2',
    lg: 'px-8 py-3.5 text-base gap-2.5',
  };

  const disabledStyles = disabled || loading ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}
