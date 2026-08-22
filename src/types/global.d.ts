import { DialogApi, LoadingBarApi, MessageApi, ModalApi, NotificationApi } from "naive-ui";
import type { RecognitionEvent } from "./shared/recognition";

declare global {
  interface Window {
    // naiveui
    $message: MessageApi;
    $dialog: DialogApi;
    $notification: NotificationApi;
    $loadingBar: LoadingBarApi;
    $modal: ModalApi;
    // electron
    api: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: unknown) => Promise<boolean>;
        has: (key: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        reset: (keys?: string[]) => Promise<boolean>;
        export: (data: any) => Promise<{ success: boolean; path?: string; error?: string }>;
        import: () => Promise<{ success: boolean; data?: any; error?: string }>;
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
