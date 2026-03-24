"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoplineAuth = void 0;
const axios_1 = __importDefault(require("axios"));
const signature_1 = require("./signature");
class ShoplineAuth {
    config;
    signature;
    axiosInstance;
    constructor(config) {
        this.config = config;
        this.signature = new signature_1.ShoplineSignature(config.appSecret);
        this.axiosInstance = axios_1.default.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    verifyInstallationRequest(queryParams) {
        return this.signature.verifyGetRequest(queryParams, queryParams.sign);
    }
    generateAuthorizationUrl(scope, customField) {
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
    handleAuthorizationCallback(queryParams) {
        if (!this.signature.verifyGetRequest(queryParams, queryParams.sign)) {
            throw new Error('Invalid signature in authorization callback');
        }
        const code = queryParams.code;
        if (!code) {
            throw new Error('Authorization code not found in callback');
        }
        const timestamp = parseInt(queryParams.timestamp, 10);
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        if (Math.abs(now - timestamp) > tenMinutes) {
            throw new Error('Request timestamp expired');
        }
        return code;
    }
    async exchangeCodeForToken(authorizationCode) {
        const url = `https://${this.config.handle}.myshopline.com/admin/oauth/token/create`;
        const timestamp = signature_1.ShoplineSignature.generateTimestamp();
        const body = JSON.stringify({ code: authorizationCode });
        const sign = this.signature.signPostRequest(body, timestamp);
        try {
            const response = await this.axiosInstance.post(url, body, {
                headers: {
                    appkey: this.config.appKey,
                    timestamp,
                    sign,
                },
            });
            if (response.data.code !== 200) {
                throw new Error(`Failed to get access token: ${response.data.i18nCode} - ${response.data.message}`);
            }
            return response.data.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Token exchange failed: ${error.message}`);
            }
            throw error;
        }
    }
    async refreshAccessToken(currentToken) {
        const url = `https://${this.config.handle}.myshopline.com/admin/oauth/token/refresh`;
        const timestamp = signature_1.ShoplineSignature.generateTimestamp();
        const sign = this.signature.signPostRequest('', timestamp);
        try {
            const response = await this.axiosInstance.post(url, {}, {
                headers: {
                    appkey: this.config.appKey,
                    timestamp,
                    sign,
                    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
                },
            });
            if (response.data.code !== 200) {
                throw new Error(`Failed to refresh token: ${response.data.i18nCode} - ${response.data.message}`);
            }
            return response.data.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Token refresh failed: ${error.message}`);
            }
            throw error;
        }
    }
    async completeOAuthFlow(installationParams, scope, customField) {
        if (!this.verifyInstallationRequest(installationParams)) {
            throw new Error('Invalid installation request signature');
        }
        const authUrl = this.generateAuthorizationUrl(scope, customField);
        console.log(`Redirect merchant to: ${authUrl}`);
        throw new Error('Complete OAuth flow requires merchant redirection. Use individual methods instead.');
    }
    static isTokenExpired(expireTime) {
        const expiration = new Date(expireTime).getTime();
        const now = Date.now();
        return now >= expiration;
    }
    static getTokenTimeRemaining(expireTime) {
        const expiration = new Date(expireTime).getTime();
        const now = Date.now();
        return expiration - now;
    }
}
exports.ShoplineAuth = ShoplineAuth;
//# sourceMappingURL=ShoplineAuth.js.map