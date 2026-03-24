/**
 * Currency utility functions for multi-currency billing
 */

// Eurozone countries (use EUR)
const EUROZONE_COUNTRIES = [
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'
];

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  'AU': 'AUD',
  'US': 'USD',
  'GB': 'GBP',
  'EU': 'EUR',
  'default': 'USD'
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  'AUD': '$',
  'USD': '$',
  'GBP': '£',
  'EUR': '€',
  'default': '$'
};

/**
 * Exchange rates to AUD (Australian Dollar) - base currency
 * These are approximate rates and should be updated periodically
 */
export const EXCHANGE_RATES_TO_AUD: Record<string, number> = {
  'AUD': 1.0,      // Base currency
  'USD': 1.5,      // 1 USD = 1.5 AUD
  'GBP': 1.9,      // 1 GBP = 1.9 AUD
  'EUR': 1.6,      // 1 EUR = 1.6 AUD
  'default': 1.5   // Default to USD rate
};

/**
 * Get the currency code for a given country code
 */
export function getCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) {
    return COUNTRY_TO_CURRENCY['default'];
  }

  const upperCountryCode = countryCode.toUpperCase().trim();

  // Check if it's a Eurozone country
  if (EUROZONE_COUNTRIES.includes(upperCountryCode)) {
    return COUNTRY_TO_CURRENCY['EU'];
  }

  // Check direct mapping
  if (COUNTRY_TO_CURRENCY[upperCountryCode]) {
    return COUNTRY_TO_CURRENCY[upperCountryCode];
  }

  // Default to USD
  return COUNTRY_TO_CURRENCY['default'];
}

/**
 * Get the currency symbol for a given country code
 */
export function getCurrencySymbol(countryCode: string | null | undefined): string {
  const currency = getCurrencyForCountry(countryCode);
  return CURRENCY_SYMBOLS[currency] || CURRENCY_SYMBOLS['default'];
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, countryCode: string | null | undefined): string {
  const symbol = getCurrencySymbol(countryCode);
  return `${symbol}${amount}`;
}

/**
 * Convert amount from one currency to AUD
 */
export function convertToAUD(amount: number, currency: string): number {
  const rate = EXCHANGE_RATES_TO_AUD[currency] || EXCHANGE_RATES_TO_AUD['default'];
  return amount * rate;
}
