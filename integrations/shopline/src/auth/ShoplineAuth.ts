import axios, { AxiosInstance } from 'axios';
import { ShoplineSignature } from './signature';
import { ShoplineAuthConfig, ShoplineAccessToken } from '../api/types';

/**
 * Shopline OAuth 2.0 Authentication Flow
 * Handles the complete OAuth authorization process for Shopline apps.
 */
export class ShoplineAuth {
  private config: ShoplineAuthConfig;
  private signature: ShoplineSignature;
  private axiosInstance: AxiosInstance;

  constructor(config: ShoplineAuthConfig) {
    this.config = config;
    this.signature = new ShoplineSignature(config.appSecret);
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Step 1: Verify app installation request from Shopline
   * @param queryParams Query parameters from the GET request
   * @returns boolean indicating if signature is valid
   */
  verifyInstallationRequest(queryParams: Record<string, string>): boolean {
    return this.signature.verifyGetRequest(queryParams, queryParams.sign);
  }

  /**
   * Step 2: Generate authorization URL for merchant redirection
   * @param scope Required permissions (comma-separated)
   * @param customField Optional custom field to pass through callback
   * @returns Authorization URL
   */
  generateAuthorizationUrl(
    scope: string,
    customField?: string
  ): string {
    const baseUrl = `https://${this.config.handle}.myshopline.com/admin/oauth-web/#/oauth/authorize`;
    const params = new URLSearchParams({
      appKey: this.config.appKey,
      responseType: 'code',
      scope,
      redirectUri: this.config.redirectUri,
    });

    if (customField) {
      params.append('customField', encodeURIComponent(customField));
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Step 3: Verify authorization callback and extract authorization code
   * @param queryParams Query parameters from the redirect
   * @returns Authorization code if valid, throws error otherwise
   */
  handleAuthorizationCallback(queryParams: Record<string, string>): string {
    // Verify signature
    if (!this.signature.verifyGetRequest(queryParams, queryParams.sign)) {
      throw new Error('Invalid signature in authorization callback');
    }

    const code = queryParams.code;
    if (!code) {
      throw new Error('Authorization code not found in callback');
    }

    // Verify timestamp (optional - within 10 minutes)
    const timestamp = parseInt(queryParams.timestamp, 10);
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    if (Math.abs(now - timestamp) > tenMinutes) {
      throw new Error('Request timestamp expired');
    }

    return code;
  }

  /**
   * Step 4: Exchange authorization code for access token
   * @param authorizationCode Code from authorization callback
   * @returns Access token data
   */
  async exchangeCodeForToken(authorizationCode: string): Promise<ShoplineAccessToken> {
    const url = `https://${this.config.handle}.myshopline.com/admin/oauth/token/create`;
    const timestamp = ShoplineSignature.generateTimestamp();
    const body = JSON.stringify({ code: authorizationCode });
    const sign = this.signature.signPostRequest(body, timestamp);

    try {
      const response = await this.axiosInstance.post<{
        code: number;
        i18nCode: string;
        message: string | null;
        data: ShoplineAccessToken;
        traceId: string;
      }>(url, body, {
        headers: {
          appkey: this.config.appKey,
          timestamp,
          sign,
        },
      });

      if (response.data.code !== 200) {
        throw new Error(
          `Failed to get access token: ${response.data.i18nCode} - ${response.data.message}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Token exchange failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Step 6: Refresh access token before expiration
   * @param currentToken Current access token (optional)
   * @returns New access token data
   */
  async refreshAccessToken(currentToken?: string): Promise<ShoplineAccessToken> {
    const url = `https://${this.config.handle}.myshopline.com/admin/oauth/token/refresh`;
    const timestamp = ShoplineSignature.generateTimestamp();
    const sign = this.signature.signPostRequest('', timestamp);

    try {
      const response = await this.axiosInstance.post<{
        code: number;
        i18nCode: string;
        message: string | null;
        data: ShoplineAccessToken;
        traceId: string;
      }>(url, {}, {
        headers: {
          appkey: this.config.appKey,
          timestamp,
          sign,
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
      });

      if (response.data.code !== 200) {
        throw new Error(
          `Failed to refresh token: ${response.data.i18nCode} - ${response.data.message}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Token refresh failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Complete OAuth flow from installation request to access token
   * @param installationParams Query parameters from installation request
   * @param scope Required permissions
   * @param customField Optional custom field
   * @returns Access token data
   */
  async completeOAuthFlow(
    installationParams: Record<string, string>,
    scope: string,
    customField?: string
  ): Promise<ShoplineAccessToken> {
    // Verify installation request
    if (!this.verifyInstallationRequest(installationParams)) {
      throw new Error('Invalid installation request signature');
    }

    // Generate authorization URL (for manual redirection - in real app you would redirect merchant)
    const authUrl = this.generateAuthorizationUrl(scope, customField);
    console.log(`Redirect merchant to: ${authUrl}`);
    
    // Note: In a real implementation, you would redirect the merchant to authUrl
    // and then handle the callback separately. This method assumes you have the
    // authorization code already (maybe from a separate callback handler).
    // For simplicity, we'll assume the authorization code is obtained elsewhere.
    
    throw new Error('Complete OAuth flow requires merchant redirection. Use individual methods instead.');
  }

  /**
   * Validate access token expiration
   * @param expireTime ISO 8601 expiration time
   * @returns boolean indicating if token is expired
   */
  static isTokenExpired(expireTime: string): boolean {
    const expiration = new Date(expireTime).getTime();
    const now = Date.now();
    return now >= expiration;
  }

  /**
   * Get remaining time until token expiration in milliseconds
   * @param expireTime ISO 8601 expiration time
   * @returns Milliseconds remaining (negative if expired)
   */
  static getTokenTimeRemaining(expireTime: string): number {
    const expiration = new Date(expireTime).getTime();
    const now = Date.now();
    return expiration - now;
  }
}