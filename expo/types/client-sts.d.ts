// The backend owner-variables route dynamically imports `@aws-sdk/client-sts`
// only in a Node context to validate read-only AWS credentials. That package
// is not resolvable under Expo's module resolution, so these ambient
// declarations keep the Expo typecheck green without affecting runtime.
declare module '@aws-sdk/client-sts' {
  export class STSClient {
    constructor(config?: Record<string, unknown>);
    send(command: unknown): Promise<unknown>;
  }
  export class GetCallerIdentityCommand {
    constructor(input?: Record<string, unknown>);
  }
}
