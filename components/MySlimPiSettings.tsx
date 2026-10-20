"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { sendAgentCommand } from "@/lib/agent-client";
import { ConfigButton, ConfigSwitch } from "./SettingsUi";
type Settings = {supported:boolean;humanFallbackEnabled:boolean;shell:string};
export function MySlimPiSettings({sessionId,onClose}:{sessionId:string|null;onClose:()=>void}) {
  const {t}=useI18n();
  const [settings,setSettings]=useState<Settings|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const busy=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/my-slim-pi/settings",{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error);setSettings(data);
    }).catch(error=>{if(!controller.signal.aborted)setError(String(error.message));});
    return ()=>controller.abort();
  },[]);
  const save=async(enabled:boolean)=>{
    if(busy.current)return;busy.current=true;setSaving(true);setError("");setSaved(false);
    try {
      const response=await fetch("/api/my-slim-pi/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({humanFallbackEnabled:enabled})});
      const data=await response.json();if(!response.ok)throw Error(data.error);setSettings(data);setSaved(true);
    }catch(error){setError(error instanceof Error?error.message:String(error));}
    finally{busy.current=false;setSaving(false);}
  };
  const backgroundModels=async()=>{
    if(!sessionId||busy.current)return;busy.current=true;setSaving(true);setError("");
    try {
      // The Agent owns the subsequent selection dialogs.
      await sendAgentCommand(sessionId,{type:"open_my_slim_pi_settings"});onClose();
    } catch(error){setError(error instanceof Error?error.message:String(error));}
    finally{busy.current=false;setSaving(false);}
  };
  return <div className="settings-general">
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("slim.permissions")}</h3>
      <p className="settings-general-description">{t("slim.permissionsDescription")}</p>
      <div className="settings-chat-options"><div className="settings-chat-option settings-chat-switch-option">
        <span id="slim-fallback-label">{t("slim.fallback")}</span>
        <ConfigSwitch checked={settings?.humanFallbackEnabled===true} disabled={!settings?.supported||saving} label={t("slim.fallback")} describedBy="slim-fallback-description" onChange={enabled=>void save(enabled)} />
      </div></div>
      <p id="slim-fallback-description" className="settings-general-description">{t("slim.fallbackDescription")}</p>
      {settings&&!settings.supported&&<p className="settings-general-error">{t("slim.updateRequired")}</p>}
      {saved&&<p role="status" className="settings-general-description">{t("slim.saved")}</p>}
    </section>
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("slim.backgroundModels")}</h3>
      <p className="settings-general-description">{t("slim.backgroundModelsDescription")}</p>
      <ConfigButton variant="secondary" disabled={!sessionId||saving} onClick={()=>void backgroundModels()}>{t("slim.configureModels")}</ConfigButton>
      {!sessionId&&<p className="settings-general-description">{t("slim.sessionRequired")}</p>}
    </section>
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("slim.runtime")}</h3>
      <p className="settings-general-description">{t("slim.runtimeDescription",{shell:settings?.shell??"—"})}</p>
    </section>
    {!settings&&!error&&<p role="status" className="settings-general-description">{t("i18n.loading")}</p>}
    {error&&<p role="alert" className="settings-general-error">{error}</p>}
  </div>;
}
