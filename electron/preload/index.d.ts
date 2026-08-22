import { ElectronAPI } from "@electron-toolkit/preload";
import type { StoreType } from "../main/store";
import type { RecognitionEvent } from "../../src/types/shared/recognition";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      store: {
        get<K extends keyof StoreType>(key: K): Promise<StoreType[K]>;
        set<K extends keyof StoreType>(key: K, value: StoreType[K]): Promise<boolean>;
        has(key: keyof StoreType): Promise<boolean>;
        delete(key: keyof StoreType): Promise<boolean>;
        reset(keys?: (keyof StoreType)[]): Promise<boolean>;
        export(data: any): Promise<{ success: boolean; path?: string; error?: string }>;
        import(): Promise<{ success: boolean; data?: any; error?: string }>;
      };
      system: {
        osInfo: {
          type: string;
          arch: string;
          release: string;
        };
      };
      recognition: {
        isSupported: () => Promise<boolean>;
        start: (config: {
          source: "system" | "microphone";
          durationMs: number;
        }) => Promise<unknown>;
        cancel: () => Promise<unknown>;
        submitPcm: (pcm: Float32Array) => Promise<unknown>;
        onEvent: (callback: (event: RecognitionEvent) => void) => () => void;
      };
    };
    // logs
    logger: {
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
      debug: (message: string, ...args: unknown[]) => void;
    };
  }
}
