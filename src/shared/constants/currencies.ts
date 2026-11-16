




export interface CurrencyInfo {
  code: string;
  numeric: string;
  name: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES = {
  USD: { code: "USD", numeric: "840", name: "United States Dollar", decimals: 2 },
  EUR: { code: "EUR", numeric: "978", name: "Euro", decimals: 2 },
  JPY: { code: "JPY", numeric: "392", name: "Japanese Yen", decimals: 0 },
  GBP: { code: "GBP", numeric: "826", name: "British Pound Sterling", decimals: 2 },
  CNY: { code: "CNY", numeric: "156", name: "Chinese Yuan", decimals: 2 },
  AUD: { code: "AUD", numeric: "036", name: "Australian Dollar", decimals: 2 },
  CAD: { code: "CAD", numeric: "124", name: "Canadian Dollar", decimals: 2 },
  CHF: { code: "CHF", numeric: "756", name: "Swiss Franc", decimals: 2 },
  HKD: { code: "HKD", numeric: "344", name: "Hong Kong Dollar", decimals: 2 },
  SGD: { code: "SGD", numeric: "702", name: "Singapore Dollar", decimals: 2 },
  SEK: { code: "SEK", numeric: "752", name: "Swedish Krona", decimals: 2 },
  KRW: { code: "KRW", numeric: "410", name: "South Korean Won", decimals: 0 },
  NOK: { code: "NOK", numeric: "578", name: "Norwegian Krone", decimals: 2 },
  NZD: { code: "NZD", numeric: "554", name: "New Zealand Dollar", decimals: 2 },
  INR: { code: "INR", numeric: "356", name: "Indian Rupee", decimals: 2 },
  MXN: { code: "MXN", numeric: "484", name: "Mexican Peso", decimals: 2 },
  TWD: { code: "TWD", numeric: "901", name: "New Taiwan Dollar", decimals: 2 },
  ZAR: { code: "ZAR", numeric: "710", name: "South African Rand", decimals: 2 },
  BRL: { code: "BRL", numeric: "986", name: "Brazilian Real", decimals: 2 },
  DKK: { code: "DKK", numeric: "208", name: "Danish Krone", decimals: 2 },
  PLN: { code: "PLN", numeric: "985", name: "Polish Zloty", decimals: 2 },
  THB: { code: "THB", numeric: "764", name: "Thai Baht", decimals: 2 },
  IDR: { code: "IDR", numeric: "360", name: "Indonesian Rupiah", decimals: 2 },
  HUF: { code: "HUF", numeric: "348", name: "Hungarian Forint", decimals: 2 },
  CZK: { code: "CZK", numeric: "203", name: "Czech Koruna", decimals: 2 },
  ILS: { code: "ILS", numeric: "376", name: "Israeli New Shekel", decimals: 2 },
  CLP: { code: "CLP", numeric: "152", name: "Chilean Peso", decimals: 0 },
  PHP: { code: "PHP", numeric: "608", name: "Philippine Peso", decimals: 2 },
  AED: { code: "AED", numeric: "784", name: "UAE Dirham", decimals: 2 },
  COP: { code: "COP", numeric: "170", name: "Colombian Peso", decimals: 2 },
  MAD: { code: "MAD", numeric: "504", name: "Moroccan Dirham", decimals: 2 },
  SAR: { code: "SAR", numeric: "682", name: "Saudi Riyal", decimals: 2 },
  TRY: { code: "TRY", numeric: "949", name: "Turkish Lira", decimals: 2 },
  EGP: { code: "EGP", numeric: "818", name: "Egyptian Pound", decimals: 2 },
} as const;


export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

const NUMERIC_TO_CODE_MAP: Record<string, CurrencyCode> =
  Object.entries(SUPPORTED_CURRENCIES).reduce((acc, [code, info]) => {
    acc[info.numeric] = code as CurrencyCode;
    return acc;
  }, {} as Record<string, CurrencyCode>);

// Get full currency info
export function getCurrencyInfo(value: string): CurrencyInfo | undefined {
  if (value in SUPPORTED_CURRENCIES) {
    return SUPPORTED_CURRENCIES[value as CurrencyCode];
  }

  const code = NUMERIC_TO_CODE_MAP[value];
  if (code) {
    return SUPPORTED_CURRENCIES[code];
  }

  return undefined;
}

/**
 * Normalize currency input to numeric code
 * Accepts: "MAD", "504", "usd", "840" → returns numeric code ("504", "840", etc.)
 * @param currency - Currency code or numeric
 * @returns Numeric code or undefined if not supported
 */
export function normalizeCurrency(currency: string): string | undefined {
  const info = getCurrencyInfo(currency.toUpperCase());
  return info?.numeric;
}

/**
 * Normalize currency input to alphabetic code
 * Accepts: "MAD", "504", "usd", "840" → returns code ("MAD", "USD", etc.)
 * @param currency - Currency code or numeric
 * @returns Alphabetic code or undefined if not supported
 */
export function normalizeCurrencyCode(currency: string): string | undefined {
  const info = getCurrencyInfo(currency.toUpperCase());
  return info?.code;
}

/**
 * Check if currency is MAD (Moroccan Dirham)
 * Accepts: "MAD", "504" → returns true
 * @param currency - Currency code or numeric
 */
export function isMoroccanDirham(currency: string): boolean {
  const info = getCurrencyInfo(currency.toUpperCase());
  return info?.code === 'MAD';
}

// Check if supported (uses normalize for DRY compliance)
export function isSupportedCurrency(value: string): boolean {
  return normalizeCurrency(value) !== undefined;
}