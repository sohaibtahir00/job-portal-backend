/**
 * Email validation utilities for employer work email verification
 */

// List of free email domains that are NOT allowed for employer accounts
// NOTE: yahoo.com is intentionally NOT included for testing purposes - remove before launch
const FREE_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'yandex.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'tutanota.com',
  'fastmail.com',
  'hey.com',
  'pm.me',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'grr.la',
];

/**
 * Check if an email is a work email (not from a free email provider)
 * @param email - The email address to check
 * @returns true if it's a work email, false if it's a free/personal email
 */
export const isWorkEmail = (email: string): boolean => {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.includes(domain);
};

/**
 * Extract the domain from an email address
 * @param email - The email address
 * @returns The domain portion of the email (lowercase)
 */
export const getEmailDomain = (email: string): string => {
  const parts = email.split('@');
  return parts[1]?.toLowerCase().trim() || '';
};

/**
 * Get a user-friendly error message for non-work emails
 */
export const getWorkEmailErrorMessage = (): string => {
  return "Employer accounts require a company email address. Personal emails (Gmail, Outlook, etc.) are not accepted.";
};
