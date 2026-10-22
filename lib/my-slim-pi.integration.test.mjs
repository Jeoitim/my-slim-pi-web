import assert from "node:assert/strict";
import test from "node:test";
import {mkdir, readFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {fauxAssistantMessage,fauxProvider,fauxText,fauxToolCall} from "@earendil-works/pi-ai";
import {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {createJiti} from "jiti";

const agentDir=process.env.MY_SLIM_PI_TEST_AGENT_DIR;
test("real My Slim Pi resources, four modes, restoration, isolation and ASK tool approval",{skip:!agentDir,timeout:90000},async t=>{
 assert.ok(resolve(agentDir).replaceAll("\\","/").includes("/.local/"),"Only a disposable .local AgentRoot may be tested");
 process.env.PI_CODING_AGENT_DIR=agentDir;
 if(process.env.MY_SLIM_PI_TEST_LIVE_MCP === "1") delete process.env.PI_WEB_DISABLE_MCP;
 else process.env.PI_WEB_DISABLE_MCP="1";
 process.env.PI_HASHLINE_DIR=join(agentDir,"hashline-test");
 const cwd=join(agentDir,"web-test-project");await mkdir(cwd,{recursive:true});
 const faux=fauxProvider({models:[{id:"web-test-model"}]});
 const original=ModelRuntime.create;
 ModelRuntime.create=async(...args)=>{const runtime=await original.apply(ModelRuntime,args);runtime.registerNativeProvider(faux.provider);return runtime;};
 t.after(()=>{ModelRuntime.create=original;});
 const jiti=createJiti(import.meta.url,{tsconfigPaths:true});
 const {startRpcSession,setRpcSessionTools}=await jiti.import("./rpc-manager.ts");
 const make=async id=>{const {session}=await startRpcSession(id,"",cwd,{initialModel:{provider:faux.provider.id,modelId:"web-test-model"}});await session.waitUntilReady();await delay(30);return session;};
 const first=await make("__new__slim-integration");
 let reopened,second;
 t.after(async()=>{for(const session of [first,reopened,second])if(session?.isAlive())await session.shutdown();});
 const mode=async session=>(await session.send({type:"get_state"})).extensionStatuses.find(s=>s.key==="timrt-permission-mode")?.text;
 assert.equal(await mode(first),"auto");
 assert.deepEqual(first.inner.resourceLoader.getExtensions().errors,[]);
 const names=first.inner.getActiveToolNames();
 assert.ok(names.includes(process.platform==="win32"?"powershell":"bash"));
 for(const name of ["memory","request_subagent"])assert.ok(names.includes(name),name);
 assert.ok(first.inner.getAllTools().some(tool=>tool.name==="web_search"));
 assert.ok(names.includes("web_enable") || names.includes("web_search"),"native Web tools are available for configured or on-demand activation");
 assert.ok(!names.includes("Agent"),"Web must not activate its independent subagent harness");
 await assert.rejects(setRpcSessionTools(first.sessionId,first.sessionFile,[]),/My Slim Pi owns/);
 for(const next of ["act","ask","plan","auto"]){assert.equal((await first.send({type:"set_permission_mode",mode:next})).mode,next);}
 await first.send({type:"set_permission_mode",mode:"plan"});
 const target=join(cwd,"plan-must-not-write.txt");
 const runTool=async(session,name,args)=>{
   const id="test-"+Math.random();
   faux.setResponses([fauxAssistantMessage(fauxToolCall(name,args,{id}),{stopReason:"toolUse"}),fauxAssistantMessage([fauxText("done")])]);
   await session.inner.prompt("Run only the requested test tool once.",{source:"rpc"});
   return session.inner.sessionManager.getEntries().find(e=>e.type==="message"&&e.message.role==="toolResult"&&e.message.toolCallId===id)?.message;
 };
 const planResult=await runTool(first,"write",{path:target,content:"blocked"});
 assert.equal(planResult.isError,true);await assert.rejects(readFile(target));
 const file=first.sessionFile,id=first.sessionId;await first.shutdown();
 reopened=(await startRpcSession(id,file,undefined)).session;await reopened.waitUntilReady();await delay(30);
 assert.equal(await mode(reopened),"plan");
 second=await make("__new__slim-second");assert.equal(await mode(second),"auto");
 await reopened.send({type:"set_permission_mode",mode:"ask"});
 assert.equal(await mode(second),"auto");
 let decision=true,requests=0;
 const off=reopened.onEvent(event=>{if(event.type==="extension_ui_request"&&event.method==="confirm"){
   requests++;assert.equal(event.expiresAt,undefined);
   void delay(25).then(()=>reopened.send({type:"extension_ui_response",id:event.id,...(decision==="cancel"?{cancelled:true}:{confirmed:decision})}));
 }});t.after(off);
 const approved=join(cwd,"approved.txt");
 assert.ok(!(await runTool(reopened,"write",{path:approved,content:"approved"})).isError);
 assert.equal(await readFile(approved,"utf8"),"approved");
 for(const denied of [false,"cancel"]){decision=denied;const path=join(cwd,"denied-"+denied+".txt");const result=await runTool(reopened,"write",{path,content:"denied"});assert.equal(result.isError,true);await assert.rejects(readFile(path));}
 assert.equal(requests,3,"approval is required separately for every write");
 // A real native shell tool travels through the same ASK approval path.
 decision=true;
 const shell=process.platform==="win32"?"powershell":"bash";
 const result=await runTool(reopened,shell,{command:process.platform==="win32"?"Write-Output 'WEB_SHELL_OK'":"printf 'WEB_SHELL_OK'"});
 assert.match(JSON.stringify(result),/WEB_SHELL_OK/);
 assert.equal(await mode(reopened),"ask");
 if(process.env.MY_SLIM_PI_TEST_LIVE_MCP === "1") {
   if(!reopened.inner.getActiveToolNames().includes("web_search"))assert.ok(!(await runTool(reopened,"web_enable",{})).isError);
   const searched=await runTool(reopened,"web_search",{query:"Pi coding agent SDK official documentation pi.dev",provider:"parallel-mcp",includeContent:false});
   assert.ok(!searched.isError,JSON.stringify(searched));
   assert.match(JSON.stringify(searched.content),/https?:/);
   console.log("Live native Web search through the Web AgentSession: OK (free Parallel MCP only)");
 }
});
