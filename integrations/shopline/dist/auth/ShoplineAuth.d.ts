import { ShoplineAuthConfig, ShoplineAccessToken } from '../api/types';
export declare class ShoplineAuth {
    private config;
    private signature;
    private axiosInstance;
    constructor(config: ShoplineAuthConfig);
    verifyInstallationRequest(queryParams: Record<string, string>): boolean;
    generateAuthorizationUrl(scope: string, customField?: string): string;
    handleAuthorizationCallback(queryParams: Record<string, string>): string;
    exchangeCodeForToken(authorizationCode: string): Promise<ShoplineAccessToken>;
    refreshAccessToken(currentToken?: string): Promise<ShoplineAccessToken>;
    completeOAuthFlow(installationParams: Record<string, string>, scope: string, customField?: string): Promise<ShoplineAccessToken>;
    static isTokenExpired(expireTime: string): boolean;
    static getTokenTimeRemaining(expireTime: string): number;
}
//# sourceMappingURL=ShoplineAuth.d.ts.map