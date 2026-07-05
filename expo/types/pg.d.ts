// The `pg` package resolves to its ESM build under Expo's module resolution,
// which ships without adjacent type declarations. The backend file imported by
// the owner-variables screen only uses pg in a Node context; these ambient
// declarations keep the Expo typecheck green without affecting runtime.
declare module 'pg' {
  export interface QueryResult<R = unknown> {
    rows: R[];
    rowCount: number | null;
  }
  export interface PoolClient {
    query<R = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
    release(err?: boolean): void;
  }
  export interface Pool {
    query<R = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export const Pool: { new (config?: Record<string, unknown>): Pool };
  const pg: unknown;
  export default pg;
}
