// src/shared/constants/languages.ts

export const SUPPORTED_LANGUAGES = [
  'en', 'tr', 'ar', 'fr', 'de', 'es', 'it', 'pt', 'ru',
  'zh', 'ja', 'ko', 'nl', 'pl', 'sv', 'no', 'da', 'fi',
  'cs', 'el', 'he', 'hi', 'th', 'id', 'vi', 'uk'
] as const;

export type Language = typeof SUPPORTED_LANGUAGES[number];


// Full name → 2-letter code mapping
const LANGUAGE_FULLNAME_TO_CODE: Record<string, Language> = {
  ENGLISH: 'en',
  TURKISH: 'tr',
  ARABIC: 'ar',
  FRENCH: 'fr',
  GERMAN: 'de',
  SPANISH: 'es',
  ITALIAN: 'it',
  PORTUGUESE: 'pt',
  RUSSIAN: 'ru',
  CHINESE: 'zh',
  JAPANESE: 'ja',
  KOREAN: 'ko',
  DUTCH: 'nl',
  POLISH: 'pl',
  SWEDISH: 'sv',
  NORWEGIAN: 'no',
  DANISH: 'da',
  FINNISH: 'fi',
  CZECH: 'cs',
  GREEK: 'el',
  HEBREW: 'he',
  HINDI: 'hi',
  THAI: 'th',
  INDONESIAN: 'id',
  VIETNAMESE: 'vi',
  UKRAINIAN: 'uk',
} as const;

/**
 * Normalize language input to 2-letter code
 * Accepts: "en", "EN", "english", "ENGLISH" → returns "en"
 * @param lang - Language code or full name
 * @returns Normalized 2-letter code or undefined if not supported
 */
export function normalizeLanguage(lang: string | undefined): Language | undefined {

  if (!lang) {
    return undefined;
  }
  const trimmed = lang.trim();

  // Already a supported 2-letter code (case-sensitive)
  if (SUPPORTED_LANGUAGES.includes(trimmed as Language)) {
    return trimmed as Language;
  }

  // Try as uppercase 2-letter code (e.g., "EN" → "en")
  const lower = trimmed.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(lower as Language)) {
    return lower as Language;
  }

  // Try full name (case-insensitive)
  const upper = trimmed.toUpperCase();
  return LANGUAGE_FULLNAME_TO_CODE[upper];
}

/**
 * Check if language is supported
 * @param lang - Language code or full name
 */
export function isSupportedLanguage(lang: string): lang is Language {
  return normalizeLanguage(lang) !== undefined;
}
