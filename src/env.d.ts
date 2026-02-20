/// <reference types="astro/client" />

declare module "dropzone" {
  export interface DropzoneInstance {
    on(event: string, callback: (...args: unknown[]) => void): void;
  }
  export interface DropzoneOptions {
    url?: string;
    paramName?: string;
    maxFilesize?: number;
    acceptedFiles?: string;
    clickable?: boolean;
    init?(this: DropzoneInstance): void;
  }
  export class Dropzone {
    constructor(element: HTMLElement, options?: DropzoneOptions);
    static autoDiscover: boolean;
  }
}
declare module "dropzone/dist/dropzone.js" {
  import type { DropzoneInstance, DropzoneOptions } from "dropzone";
  export class Dropzone {
    constructor(element: HTMLElement, options?: DropzoneOptions);
    static autoDiscover: boolean;
  }
}
declare module "dropzone/dist/dropzone.mjs" {
  import type { DropzoneInstance, DropzoneOptions } from "dropzone";
  export class Dropzone {
    constructor(element: HTMLElement, options?: DropzoneOptions);
    static autoDiscover: boolean;
  }
}
declare module "dropzone/dist/dropzone.css" {
  const url: string;
  export default url;
}

declare global {
  namespace App {
    /** Interface mínima do KV (edgepress_cache) para tipagem em Locals. */
    interface KVLike {
      get(key: string, type?: "text" | "json"): Promise<unknown>;
      put(key: string, value: string): Promise<void>;
      list?(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: { name: string }[];
        list_complete: boolean;
        cursor?: string;
      }>;
      delete?(key: string): Promise<void>;
    }

    interface Locals {
      user: import("better-auth").User | null;
      session: import("better-auth").Session | null;
      runtime?: { env?: { edgepress_cache?: App.KVLike | null } };
    }
  }

  interface Window {
    Alpine?: { $data: (el: Element) => Record<string, unknown> };
    slugify?: (text: string) => string;
  }
}

export {};
