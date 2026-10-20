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
  version: string;
  nodeVersion: string;
  startup?: { backendReadyMs: number; healthReadyMs: number };
}
export interface DesktopBridge {
  readonly platform: "win32" | "darwin" | "linux";
  getSettings(): Promise<DesktopSettings>;
  getStatus(): Promise<ServiceStatus>;
  updateSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
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
