/**
 * Check if a user is a super admin based on their email domain
 * Super admins are users with emails ending in:
 * - @spotonwebsites.com.au
 * - @myapex.io
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  return (
    normalizedEmail.endsWith('@spotonwebsites.com.au') ||
    normalizedEmail.endsWith('@myapex.io')
  );
}
