/**
 * react-i18next type augmentation.
 * Ties TypeScript to the `en/translation.json` shape so that
 * `t('key')` returns `string` instead of `{}`, eliminating the
 * TS2345 / TS2322 errors in AppShell.tsx and TopBar.tsx.
 */
import 'react-i18next';
import type en from './locales/en/translation.json';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
