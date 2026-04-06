declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

declare global {
  interface Array<T> {
    findLastIndex(
      predicate: (value: T, index: number, obj: T[]) => unknown,
      thisArg?: any
    ): number
  }
  interface Window {
    __PUBLIC_PATH__?: string;
  }
}

export {}