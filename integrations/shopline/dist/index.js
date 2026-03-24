"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoplineBlogService = exports.ShoplineClient = exports.ShoplineSignature = exports.ShoplineAuth = void 0;
exports.createShoplineIntegration = createShoplineIntegration;
var ShoplineAuth_1 = require("./auth/ShoplineAuth");
Object.defineProperty(exports, "ShoplineAuth", { enumerable: true, get: function () { return ShoplineAuth_1.ShoplineAuth; } });
var signature_1 = require("./auth/signature");
Object.defineProperty(exports, "ShoplineSignature", { enumerable: true, get: function () { return signature_1.ShoplineSignature; } });
var ShoplineClient_1 = require("./api/ShoplineClient");
Object.defineProperty(exports, "ShoplineClient", { enumerable: true, get: function () { return ShoplineClient_1.ShoplineClient; } });
var ShoplineBlogService_1 = require("./services/ShoplineBlogService");
Object.defineProperty(exports, "ShoplineBlogService", { enumerable: true, get: function () { return ShoplineBlogService_1.ShoplineBlogService; } });
__exportStar(require("./api/types"), exports);
const ShoplineAuth_2 = require("./auth/ShoplineAuth");
const signature_2 = require("./auth/signature");
const ShoplineClient_2 = require("./api/ShoplineClient");
const ShoplineBlogService_2 = require("./services/ShoplineBlogService");
function createShoplineIntegration(config) {
    const client = new ShoplineClient_2.ShoplineClient({
        handle: config.handle,
        accessToken: config.accessToken,
        baseUrl: config.baseUrl,
    });
    let auth;
    if (config.appKey && config.appSecret && config.redirectUri) {
        auth = new ShoplineAuth_2.ShoplineAuth({
            handle: config.handle,
            appKey: config.appKey,
            appSecret: config.appSecret,
            redirectUri: config.redirectUri,
        });
    }
    const blogService = new ShoplineBlogService_2.ShoplineBlogService(client);
    return {
        auth,
        client,
        blogService,
    };
}
exports.default = {
    ShoplineAuth: ShoplineAuth_2.ShoplineAuth,
    ShoplineSignature: signature_2.ShoplineSignature,
    ShoplineClient: ShoplineClient_2.ShoplineClient,
    ShoplineBlogService: ShoplineBlogService_2.ShoplineBlogService,
    createShoplineIntegration,
};
//# sourceMappingURL=index.js.map