import assert from "node:assert/strict";
import test from "node:test";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{tsconfigPaths:true});
const {AgentSessionWrapper}=await jiti.import("./rpc-manager.ts");
function setup(t, apply=true) {
 let ui; const calls=[];
 const inner={sessionId:"mode-switch",isStreaming:false,isCompacting:false,isBashRunning:false,isIdle:true,
  sessionManager:{getCwd:()=>process.cwd()},agent:{state:{},abort(){}},dispose(){},
  extensionRunner:{getRegisteredCommands:()=>[{invocationName:"approval-mode",sourceInfo:{path:"timrt-suite"}}]},
  prompt:async(message)=>{calls.push(message);if(apply)ui.setStatus("timrt-permission-mode",message.split(" ")[1]);}
 };
 const wrapper=new AgentSessionWrapper(inner);ui=wrapper.createExtensionUiContext();
 ui.setStatus("timrt-permission-mode","auto");t.after(()=>wrapper.destroy());
 return {wrapper,ui,inner,calls};
}
test("four modes invoke only the registered extension command and return actual status",async t=>{
 const {wrapper,calls}=setup(t);
 for(const mode of ["auto","act","ask","plan"]){const result=await wrapper.send({type:"set_permission_mode",mode});assert.equal(result.mode,mode);}
 assert.deepEqual(calls,["/approval-mode auto","/approval-mode act","/approval-mode ask","/approval-mode plan"]);
 await assert.rejects(wrapper.send({type:"set_permission_mode",mode:"allow-all"}),/Invalid/);
});
test("failed commands never invent a mode; missing state and busy sessions refuse",async t=>{
 const {wrapper,ui,inner}=setup(t,false);
 await assert.rejects(wrapper.send({type:"set_permission_mode",mode:"ask"}),/did not confirm/);
 assert.equal(wrapper.getExtensionStatuses().find(x=>x.key==="timrt-permission-mode").text,"auto");
 ui.setStatus("timrt-permission-mode",undefined);
 await assert.rejects(wrapper.send({type:"set_permission_mode",mode:"ask"}),/unavailable/);
 inner.isStreaming=true;await assert.rejects(wrapper.send({type:"set_permission_mode",mode:"plan"}),/busy/);
});
test("ASK dialogs have no timer and accept only an explicit boolean confirmation",async t=>{
 const {wrapper,ui}=setup(t);let settled=false;
 const pending=ui.confirm("ASK approval","Current call",{timeout:0}).then(value=>{settled=true;return value;});
 const request=[...wrapper.pendingUiRequests.values()][0];assert.equal(request.expiresAt,undefined);
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(settled,false);
 await wrapper.send({type:"extension_ui_response",id:request.id,confirmed:"true"});assert.equal(await pending,false);
 const cancelled=ui.confirm("ASK approval","Current call",{timeout:0});
 const next=[...wrapper.pendingUiRequests.values()][0];
 await wrapper.send({type:"extension_ui_response",id:next.id,confirmed:true,cancelled:true});assert.equal(await cancelled,false);
 const select=ui.select("Approve?",["allow","deny"],{timeout:0});
 const selected=[...wrapper.pendingUiRequests.values()][0];
 await wrapper.send({type:"extension_ui_response",id:selected.id,value:"forged"});assert.equal(await select,undefined);
});
