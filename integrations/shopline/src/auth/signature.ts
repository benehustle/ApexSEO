import crypto from 'crypto';

/**
 * Shopline Signature Utility
 * Implements HMAC-SHA256 signature generation and verification
 * as per Shopline API documentation.
 */

export class ShoplineSignature {
  private secret: string;

  constructor(appSecret: string) {
    this.secret = appSecret;
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  private hmacSha256(source: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(source)
      .digest('hex');
  }

  /**
   * Generate signature for GET request query parameters
   * @param params URLSearchParams or plain object
   * @returns signature string
   */
  signGetRequest(params: URLSearchParams | Record<string, string>): string {
    let searchParams: URLSearchParams;
    if (params instanceof URLSearchParams) {
      searchParams = params;
    } else {
      searchParams = new URLSearchParams(params);
    }

    // Remove existing 'sign' parameter if present
    searchParams.delete('sign');

    // Sort parameters alphabetically
    const sortedParams = Array.from(searchParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(entry => `${entry[0]}=${encodeURIComponent(entry[1])}`)
      .join('&');

    return this.hmacSha256(sortedParams);
  }

  /**
   * Verify signature for GET request
   * @param params URLSearchParams or plain object (including 'sign' parameter)
   * @param receivedSign The signature received in the request
   * @returns boolean indicating if signature is valid
   */
  verifyGetRequest(
    params: URLSearchParams | Record<string, string>,
    receivedSign: string
  ): boolean {
    let searchParams: URLSearchParams;
    if (params instanceof URLSearchParams) {
      searchParams = params;
    } else {
      searchParams = new URLSearchParams(params);
    }

    // Extract the signature from parameters
    const sign = searchParams.get('sign');
    if (!sign) {
      return false;
    }

    // Remove 'sign' parameter for verification
    searchParams.delete('sign');

    // Sort parameters alphabetically
    const sortedParams = Array.from(searchParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(entry => `${entry[0]}=${encodeURIComponent(entry[1])}`)
      .join('&');

    const expectedSign = this.hmacSha256(sortedParams);
    return crypto.timingSafeEqual(
      Buffer.from(expectedSign, 'hex'),
      Buffer.from(receivedSign, 'hex')
    );
  }

  /**
   * Generate signature for POST request
   * @param body Request body as string
   * @param timestamp Timestamp in milliseconds (string or number)
   * @returns signature string
   */
  signPostRequest(body: string, timestamp: string | number): string {
    const source = `${body}${timestamp}`;
    return this.hmacSha256(source);
  }

  /**
   * Verify signature for POST request
   * @param body Request body as string
   * @param timestamp Timestamp in milliseconds (string or number)
   * @param receivedSign The signature received in the request header
   * @returns boolean indicating if signature is valid
   */
  verifyPostRequest(
    body: string,
    timestamp: string | number,
    receivedSign: string
  ): boolean {
    const expectedSign = this.signPostRequest(body, timestamp);
    return crypto.timingSafeEqual(
      Buffer.from(expectedSign, 'hex'),
      Buffer.from(receivedSign, 'hex')
    );
  }

  /**
   * Verify webhook signature (X-Shopline-Hmac-Sha256 header)
   * @param body Request body as string
   * @param receivedSignature The signature from X-Shopline-Hmac-Sha256 header
   * @returns boolean indicating if signature is valid
   */
  verifyWebhookSignature(body: string, receivedSignature: string): boolean {
    const expectedSignature = this.hmacSha256(body);
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  }

  /**
   * Generate current timestamp in milliseconds
   */
  static generateTimestamp(): string {
    return Date.now().toString();
  }
}