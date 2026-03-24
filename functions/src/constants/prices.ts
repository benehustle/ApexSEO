/**
 * Multi-Currency Billing Constants
 * Maps country codes to Stripe Price IDs and currency codes
 */

// Eurozone countries (use EU price)
const EUROZONE_COUNTRIES = [
  "AT", "BE", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

export const COUNTRY_TO_PRICE_ID: Record<string, string> = {
  "AU": "price_1SWTUdAehEh6LtkhOIyBSR60", // Australia - AUD
  "US": "price_1SscYlAehEh6LtkhG9O5Tqax", // United States - USD
  "GB": "price_1SscZTAehEh6LtkhLyJKdCuF", // United Kingdom - GBP
  "EU": "price_1SscZFAehEh6LtkhpMsPWEze", // Eurozone - EUR
  "default": "price_1SscYlAehEh6LtkhG9O5Tqax", // Rest of world - USD
};

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  "AU": "AUD",
  "US": "USD",
  "GB": "GBP",
  "EU": "EUR",
  "default": "USD",
};

/**
 * Get the Stripe Price ID for a given country code
 * @param {string|null|undefined} countryCode - ISO 3166-1 alpha-2 country code (e.g., 'AU', 'US', 'GB')
 * @return {string} Stripe Price ID
 */
export function getPriceIdForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) {
    return COUNTRY_TO_PRICE_ID["default"];
  }

  const upperCountryCode = countryCode.toUpperCase().trim();

  // Check if it's a Eurozone country
  if (EUROZONE_COUNTRIES.includes(upperCountryCode)) {
    return COUNTRY_TO_PRICE_ID["EU"];
  }

  // Check direct mapping
  if (COUNTRY_TO_PRICE_ID[upperCountryCode]) {
    return COUNTRY_TO_PRICE_ID[upperCountryCode];
  }

  // Default to USD
  return COUNTRY_TO_PRICE_ID["default"];
}

/**
 * Get the currency code for a given country code
 * @param {string|null|undefined} countryCode - ISO 3166-1 alpha-2 country code (e.g., 'AU', 'US', 'GB')
 * @return {string} Currency code (e.g., 'AUD', 'USD', 'GBP', 'EUR')
 */
export function getCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) {
    return COUNTRY_TO_CURRENCY["default"];
  }

  const upperCountryCode = countryCode.toUpperCase().trim();

  // Check if it's a Eurozone country
  if (EUROZONE_COUNTRIES.includes(upperCountryCode)) {
    return COUNTRY_TO_CURRENCY["EU"];
  }

  // Check direct mapping
  if (COUNTRY_TO_CURRENCY[upperCountryCode]) {
    return COUNTRY_TO_CURRENCY[upperCountryCode];
  }

  // Default to USD
  return COUNTRY_TO_CURRENCY["default"];
}
