import type { PreferredLanguage } from '../types/domain';

interface LanguageToggleProps {
  language: PreferredLanguage;
  onChange: (nextLanguage: PreferredLanguage) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function LanguageToggle({
  language,
  onChange,
  size = 'md',
  className = '',
}: LanguageToggleProps) {
  const isTamil = language === 'ta';
  const isCompact = size === 'sm';

  return (
    <div
      className={`inline-flex items-center gap-1.5 sm:gap-2 select-none ${className}`}
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => onChange('en')}
        aria-pressed={!isTamil}
        className={`cursor-pointer rounded px-1 py-0.5 typo-btn font-bold tracking-wide transition-colors duration-200 whitespace-nowrap ${
          !isTamil
            ? 'text-emerald-700'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        EN
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={isTamil}
        aria-label={
          isTamil
            ? 'Switch language to English'
            : 'Switch language to Tamil'
        }
        title={
          isTamil
            ? 'Switch to English (EN)'
            : 'Switch to Tamil (தமிழ்)'
        }
        onClick={() => onChange(isTamil ? 'en' : 'ta')}
        className={`group relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-1 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 motion-reduce:transition-none ${
          isCompact
            ? 'h-8 w-[60px]'
            : 'h-9 w-[68px] sm:h-10 sm:w-[76px]'
        } bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 shadow-[0_3px_10px_-2px_rgba(13,148,136,0.45),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:scale-[1.03] hover:brightness-105 hover:shadow-[0_6px_16px_-2px_rgba(37,99,235,0.45)] active:scale-[0.97]`}
      >
        {/* Subtle inner sheen overlay */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent"
        />

        {/* Sliding Circular White Knob */}
        <span
          aria-hidden="true"
          className={`relative z-10 flex items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.28)] ring-1 ring-black/5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            isCompact
              ? `h-6 w-6 ${isTamil ? 'translate-x-7' : 'translate-x-0'}`
              : `h-7 w-7 sm:h-8 sm:w-8 ${
                  isTamil
                    ? 'translate-x-8 sm:translate-x-9'
                    : 'translate-x-0'
                }`
          }`}
        />
      </button>

      <button
        type="button"
        onClick={() => onChange('ta')}
        aria-pressed={isTamil}
        className={`cursor-pointer rounded px-1 py-0.5 typo-btn font-bold transition-colors duration-200 whitespace-nowrap ${
          isTamil
            ? 'text-blue-700'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        தமிழ்
      </button>
    </div>
  );
}
