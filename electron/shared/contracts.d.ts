export interface DesktopSettings {
  externalControl: boolean;
  port: number;
}
export type ServicePhase = "stopped" | "starting" | "running" | "stopping" | "error";
export interface ServiceStatus {
  phase: ServicePhase;
  externalUrl: string | null;
  error: string | null;
  passwordConfigured: boolean;
  webPassword?: { saved: boolean; available: boolean; source: "none" | "stored" | "environment"; error: "read" | "decrypt" | "unavailable" | null };
  version: string;
  nodeVersion: string;
  startup?: { backendReadyMs: number; healthReadyMs: number; runtimeReadyMs?: number; startupAssetsMs?: number; entryToReadyMs?: number; cpuMs?: number; loadNextMs?: number; prepareNextMs?: number; compileCache?: "enabled" | "disabled" | "unavailable";
    resolutionIndex?: { state: string; hits: number; misses: number; entries: number; sources?: { state: string; hits: number; entries: number } } };
}
export interface DesktopBridge {
  readonly platform: "win32" | "darwin" | "linux";
  getSettings(): Promise<DesktopSettings>;
  writeClipboardText(text: string): Promise<void>;
  paste(): Promise<void>;
  getStatus(): Promise<ServiceStatus>;
  updateSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  setWebPassword(password: string): Promise<boolean>;
  removeWebPassword(): Promise<boolean>;
  openLocalWeb(): Promise<void>;
  copyLocalWebUrl(): Promise<void>;
  restartService(): Promise<void>;
  retryService(): Promise<void>;
  quit(): Promise<void>;
  toggleFullScreen(): Promise<void>;
  setTitleBarColors(colors: { background: string; foreground: string }): Promise<void>;
}
declare global {
  interface Window { piDesktop?: DesktopBridge }
}
