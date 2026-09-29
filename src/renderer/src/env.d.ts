/// <reference types="vite/client" />
import type { KomenskyApi } from "@shared/ipc";
declare global {
  interface Window {
    komensky: KomenskyApi;
  }
}
export {};
