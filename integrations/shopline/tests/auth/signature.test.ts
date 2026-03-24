import crypto from 'crypto';
import { ShoplineSignature } from '../../src/auth/signature';

describe('ShoplineSignature', () => {
  const appSecret = 'test-secret-key-123';
  let signature: ShoplineSignature;

  beforeEach(() => {
    signature = new ShoplineSignature(appSecret);
  });

  describe('signGetRequest', () => {
    it('should generate correct HMAC-SHA256 signature for GET request', () => {
      const params = {
        appkey: 'test-app-key',
        timestamp: '1234567890',
        handle: 'teststore',
      };

      const sign = signature.signGetRequest(params);

      // Manually compute expected signature
      const sortedParams = new URLSearchParams(params);
      const sortedParamString = Array.from(sortedParams.entries())
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const expectedSign = crypto
        .createHmac('sha256', appSecret)
        .update(sortedParamString)
        .digest('hex');

      expect(sign).toBe(expectedSign);
    });

    it('should exclude existing sign parameter', () => {
      const params = {
        appkey: 'test-app-key',
        timestamp: '1234567890',
        handle: 'teststore',
        sign: 'existing-signature',
      };

      const sign = signature.signGetRequest(params);

      // The sign parameter should not be included in the signature calculation
      const { sign: _, ...paramsWithoutSign } = params;
      const sortedParams = new URLSearchParams(paramsWithoutSign);
      const sortedParamString = Array.from(sortedParams.entries())
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const expectedSign = crypto
        .createHmac('sha256', appSecret)
        .update(sortedParamString)
        .digest('hex');

      expect(sign).toBe(expectedSign);
    });
  });

  describe('verifyGetRequest', () => {
    it('should verify valid signature', () => {
      const params = {
        appkey: 'test-app-key',
        timestamp: '1234567890',
        handle: 'teststore',
      };

      const sign = signature.signGetRequest(params);
      const paramsWithSign = { ...params, sign };

      const isValid = signature.verifyGetRequest(paramsWithSign, sign);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const params = {
        appkey: 'test-app-key',
        timestamp: '1234567890',
        handle: 'teststore',
        sign: 'invalid-signature',
      };

      const isValid = signature.verifyGetRequest(params, 'invalid-signature');
      expect(isValid).toBe(false);
    });

    it('should return false when sign parameter is missing', () => {
      const params = {
        appkey: 'test-app-key',
        timestamp: '1234567890',
        handle: 'teststore',
      };

      const isValid = signature.verifyGetRequest(params, 'some-signature');
      expect(isValid).toBe(false);
    });
  });

  describe('signPostRequest', () => {
    it('should generate correct HMAC-SHA256 signature for POST request', () => {
      const body = JSON.stringify({ code: 'authorization-code' });
      const timestamp = '1234567890';

      const sign = signature.signPostRequest(body, timestamp);

      const expectedSign = crypto
        .createHmac('sha256', appSecret)
        .update(body + timestamp)
        .digest('hex');

      expect(sign).toBe(expectedSign);
    });
  });

  describe('verifyPostRequest', () => {
    it('should verify valid POST signature', () => {
      const body = JSON.stringify({ code: 'authorization-code' });
      const timestamp = '1234567890';

      const sign = signature.signPostRequest(body, timestamp);
      const isValid = signature.verifyPostRequest(body, timestamp, sign);

      expect(isValid).toBe(true);
    });

    it('should reject invalid POST signature', () => {
      const body = JSON.stringify({ code: 'authorization-code' });
      const timestamp = '1234567890';

      const isValid = signature.verifyPostRequest(body, timestamp, 'invalid-signature');
      expect(isValid).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const body = JSON.stringify({ event: 'order.created', data: { id: '123' } });

      // Manually compute expected signature
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(body)
        .digest('hex');

      const isValid = signature.verifyWebhookSignature(body, expectedSignature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const body = JSON.stringify({ event: 'order.created', data: { id: '123' } });

      const isValid = signature.verifyWebhookSignature(body, 'invalid-signature');
      expect(isValid).toBe(false);
    });
  });

  describe('generateTimestamp', () => {
    it('should generate a timestamp string', () => {
      const timestamp = ShoplineSignature.generateTimestamp();
      expect(typeof timestamp).toBe('string');
      expect(timestamp).toMatch(/^\d+$/);
      
      const timestampNum = parseInt(timestamp, 10);
      expect(timestampNum).toBeGreaterThan(0);
    });
  });
});