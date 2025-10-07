import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const stored = (() => { try { return localStorage.getItem('lang') || undefined; } catch { return undefined; } })();
const initial = stored || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');

void i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    lng: initial,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;

