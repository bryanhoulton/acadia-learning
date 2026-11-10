/**
 * Shim to provide zod internal types that kea-typegen expects.
 * This works around kea-typegen generating invalid import paths.
 */

declare module 'zod/v3/helpers/util.d.cts' {
  export type requiredKeys<T extends object> = {
    [K in keyof T]-?: undefined extends T[K] ? never : K;
  }[keyof T];
}

declare module 'zod/v3/types.d.cts' {
  import { z } from 'zod';
  export type ZodNumber = z.ZodNumber;
  export type baseObjectOutputType<T extends z.ZodRawShape> = z.objectOutputType<T, z.ZodTypeAny>;
}
