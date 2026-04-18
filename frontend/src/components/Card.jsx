export default function Card({ title, subtitle, right, className = '', children }) {
  return (
    <section
      className={`bg-bg-card border border-border rounded-xl p-[18px] ${className}`}
    >
      {(title || right) && (
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            {title && (
              <h2 className="text-[14px] font-bold text-fg-white">{title}</h2>
            )}
            {subtitle && (
              <span className="text-xs text-fg-muted">{subtitle}</span>
            )}
          </div>
          {right && <div className="text-xs text-fg-muted">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
