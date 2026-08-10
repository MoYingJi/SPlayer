/// <reference types="vite/client" />

declare const __COMMIT_HASH__: string;
declare const __COMMIT_DATE__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, any>;
  export default component;
}
