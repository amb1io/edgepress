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

declare namespace App {
  interface Locals {
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
  }
}

declare global {
  interface Window {
    Alpine?: { $data: (el: Element) => Record<string, unknown> };
    slugify?: (text: string) => string;
  }
}

export {};
