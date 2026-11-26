import { createContext, useContext, type ReactNode } from 'react';
import { t, tr } from './i18n';
import type { PreferredLanguage } from '../types/domain';

interface LanguageContextValue {
  uiLanguage: PreferredLanguage;
  setUiLanguage: (lang: PreferredLanguage) => void;
  t: (key: string) => string;
  tr: (englishText: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  uiLanguage: 'en',
  setUiLanguage: () => {},
  t: (key) => t('en', key),
  tr: (text) => text,
});

export function LanguageProvider({
  language,
  onChangeLanguage,
  children,
}: {
  language: PreferredLanguage;
  onChangeLanguage: (lang: PreferredLanguage) => void;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider
      value={{
        uiLanguage: language,
        setUiLanguage: onChangeLanguage,
        t: (key) => t(language, key),
        tr: (text) => tr(language, text),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
