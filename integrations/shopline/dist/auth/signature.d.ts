export declare class ShoplineSignature {
    private secret;
    constructor(appSecret: string);
    private hmacSha256;
    signGetRequest(params: URLSearchParams | Record<string, string>): string;
    verifyGetRequest(params: URLSearchParams | Record<string, string>, receivedSign: string): boolean;
    signPostRequest(body: string, timestamp: string | number): string;
    verifyPostRequest(body: string, timestamp: string | number, receivedSign: string): boolean;
    verifyWebhookSignature(body: string, receivedSignature: string): boolean;
    static generateTimestamp(): string;
}
//# sourceMappingURL=signature.d.ts.map