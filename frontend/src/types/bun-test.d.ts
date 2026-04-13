declare module "bun:test" {
  interface Matcher {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toContain(expected: string): void;
    toEqual(expected: unknown): void;
  }

  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: (actual: unknown) => Matcher;
}
