/**
 * Shopline Blog Integration
 * 
 * A production-ready TypeScript library for integrating with Shopline's blog posting API.
 * 
 * @packageDocumentation
 */

// Export authentication classes
export { ShoplineAuth } from './auth/ShoplineAuth';
export { ShoplineSignature } from './auth/signature';

// Export API client
export { ShoplineClient } from './api/ShoplineClient';

// Export services
export { ShoplineBlogService } from './services/ShoplineBlogService';

// Export types
export * from './api/types';

// Convenience function for quick setup
import { ShoplineAuth } from './auth/ShoplineAuth';
import { ShoplineSignature } from './auth/signature';
import { ShoplineClient } from './api/ShoplineClient';
import { ShoplineBlogService } from './services/ShoplineBlogService';

/**
 * Create a complete Shopline blog integration service
 * @param config Configuration for Shopline integration
 * @returns Object containing auth, client, and service instances
 */
export function createShoplineIntegration(config: {
  handle: string;
  accessToken: string;
  appKey?: string;
  appSecret?: string;
  redirectUri?: string;
  baseUrl?: string;
}) {
  const client = new ShoplineClient({
    handle: config.handle,
    accessToken: config.accessToken,
    baseUrl: config.baseUrl,
  });

  let auth: ShoplineAuth | undefined;
  
  if (config.appKey && config.appSecret && config.redirectUri) {
    auth = new ShoplineAuth({
      handle: config.handle,
      appKey: config.appKey,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
    });
  }

  const blogService = new ShoplineBlogService(client);

  return {
    auth,
    client,
    blogService,
  };
}

/**
 * Default export for convenience
 */
export default {
  ShoplineAuth,
  ShoplineSignature,
  ShoplineClient,
  ShoplineBlogService,
  createShoplineIntegration,
};