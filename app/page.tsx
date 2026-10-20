import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/hooks/useI18n";
import { DesktopShell } from "@/components/DesktopShell";

export default function Home() {
  return (
    <Suspense>
      <I18nProvider>
        <DesktopShell><AppShell /></DesktopShell>
      </I18nProvider>
    </Suspense>
  );
}
