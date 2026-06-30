/**
 * Ambient type for the runtime-provided `Buffer` global.
 *
 * Several modules decode base64/JWT payloads with `Buffer` as a fallback when
 * `atob` is unavailable (server `+api` routes and polyfilled RN runtimes). The
 * React Native tsconfig does not pull in `@types/node`, so `Buffer` is untyped
 * here. This declaration types only the narrow `Buffer.from(...).toString(...)`
 * surface actually used, without dragging in the full Node typings.
 */

interface IvxBufferLike {
  toString(encoding?: string): string;
}

interface IvxBufferConstructorLike {
  from(input: string, encoding: string): IvxBufferLike;
}

declare global {
  // eslint-disable-next-line no-var
  var Buffer: IvxBufferConstructorLike;
}

export {};
