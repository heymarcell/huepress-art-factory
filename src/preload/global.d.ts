import type { HuepressApi } from './index';

// Declare the global window.huepress API
declare global {
  interface Window {
    huepress: HuepressApi;
  }
}

export {};
