"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoplineSignature = void 0;
const crypto_1 = __importDefault(require("crypto"));
class ShoplineSignature {
    secret;
    constructor(appSecret) {
        this.secret = appSecret;
    }
    hmacSha256(source) {
        return crypto_1.default
            .createHmac('sha256', this.secret)
            .update(source)
            .digest('hex');
    }
    signGetRequest(params) {
        let searchParams;
        if (params instanceof URLSearchParams) {
            searchParams = params;
        }
        else {
            searchParams = new URLSearchParams(params);
        }
        searchParams.delete('sign');
        const sortedParams = Array.from(searchParams.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => `${entry[0]}=${encodeURIComponent(entry[1])}`)
            .join('&');
        return this.hmacSha256(sortedParams);
    }
    verifyGetRequest(params, receivedSign) {
        let searchParams;
        if (params instanceof URLSearchParams) {
            searchParams = params;
        }
        else {
            searchParams = new URLSearchParams(params);
        }
        const sign = searchParams.get('sign');
        if (!sign) {
            return false;
        }
        searchParams.delete('sign');
        const sortedParams = Array.from(searchParams.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => `${entry[0]}=${encodeURIComponent(entry[1])}`)
            .join('&');
        const expectedSign = this.hmacSha256(sortedParams);
        return crypto_1.default.timingSafeEqual(Buffer.from(expectedSign, 'hex'), Buffer.from(receivedSign, 'hex'));
    }
    signPostRequest(body, timestamp) {
        const source = `${body}${timestamp}`;
        return this.hmacSha256(source);
    }
    verifyPostRequest(body, timestamp, receivedSign) {
        const expectedSign = this.signPostRequest(body, timestamp);
        return crypto_1.default.timingSafeEqual(Buffer.from(expectedSign, 'hex'), Buffer.from(receivedSign, 'hex'));
    }
    verifyWebhookSignature(body, receivedSignature) {
        const expectedSignature = this.hmacSha256(body);
        return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(receivedSignature, 'hex'));
    }
    static generateTimestamp() {
        return Date.now().toString();
    }
}
exports.ShoplineSignature = ShoplineSignature;
//# sourceMappingURL=signature.js.map