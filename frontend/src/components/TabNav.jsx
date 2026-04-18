export default function TabNav({ tabs, active, onChange }) {
  return (
    <nav className="border-b border-border bg-bg-card">
      <div className="max-w-[1400px] mx-auto px-2 sm:px-6 flex gap-1 sm:gap-6 overflow-x-auto scrollbar-none">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`py-3 px-2 sm:px-0 -mb-px border-b-2 text-xs sm:text-sm transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-accent text-fg-white font-bold'
                  : 'border-transparent text-fg-muted hover:text-fg-bright'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
