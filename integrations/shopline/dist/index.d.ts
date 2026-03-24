export { ShoplineAuth } from './auth/ShoplineAuth';
export { ShoplineSignature } from './auth/signature';
export { ShoplineClient } from './api/ShoplineClient';
export { ShoplineBlogService } from './services/ShoplineBlogService';
export * from './api/types';
import { ShoplineAuth } from './auth/ShoplineAuth';
import { ShoplineSignature } from './auth/signature';
import { ShoplineClient } from './api/ShoplineClient';
import { ShoplineBlogService } from './services/ShoplineBlogService';
export declare function createShoplineIntegration(config: {
    handle: string;
    accessToken: string;
    appKey?: string;
    appSecret?: string;
    redirectUri?: string;
    baseUrl?: string;
}): {
    auth: ShoplineAuth | undefined;
    client: ShoplineClient;
    blogService: ShoplineBlogService;
};
declare const _default: {
    ShoplineAuth: typeof ShoplineAuth;
    ShoplineSignature: typeof ShoplineSignature;
    ShoplineClient: typeof ShoplineClient;
    ShoplineBlogService: typeof ShoplineBlogService;
    createShoplineIntegration: typeof createShoplineIntegration;
};
export default _default;
//# sourceMappingURL=index.d.ts.map