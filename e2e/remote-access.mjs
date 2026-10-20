import http from "node:http";
import {Readable} from "node:stream";
import assert from "node:assert/strict";
import {join,resolve} from "node:path";

const base=process.env.PI_WEB_SMOKE_BASE_URL || "http://127.0.0.1:30143";
assert.equal(new URL(base).hostname,"127.0.0.1","Smoke tests target a disposable loopback server only");
const password=process.env.PI_WEB_SMOKE_PASSWORD;
const root=process.env.MY_SLIM_PI_TEST_AGENT_DIR;
assert.ok(password,"PI_WEB_SMOKE_PASSWORD is required");
assert.ok(root&&resolve(root).replaceAll("\\","/").includes("/.local/"),"Use a disposable .local AgentRoot");
const headers={host:"agent.example.test","x-forwarded-proto":"https",authorization:"Basic "+Buffer.from("pi:"+password).toString("base64")};
// Node 24's fetch discards a custom Host. Native HTTP sends the actual tunnel
// Host, so this tests production host validation rather than loopback alone.
const request=(path,options={})=>new Promise((resolve,reject)=>{
 const req=http.request(new URL(path,base),{method:options.method||"GET",headers:{...headers,...options.headers},signal:options.signal},incoming=>{
   const responseHeaders=new Headers();
   for(const [name,value] of Object.entries(incoming.headers))if(value!==undefined)for(const part of Array.isArray(value)?value:[value])responseHeaders.append(name,part);
   resolve(new Response(Readable.toWeb(incoming),{status:incoming.statusCode,headers:responseHeaders}));
 });
 req.on("error",reject);req.end(options.body);
});
const post=(path,body)=>request(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
assert.equal((await request("/api/sessions",{headers:{authorization:""}})).status,401);
assert.equal((await request("/api/sessions")).status,200);
assert.equal((await request("/api/sessions",{headers:{host:"attacker.example.test"}})).status,403);
assert.equal((await request("/api/agent/new",{method:"POST",headers:{origin:"https://attacker.example.test","sec-fetch-site":"cross-site"}})).status,403);
const login=await post("/api/web-auth",{password});assert.equal(login.status,200);
for(const flag of ["httponly","secure","samesite=lax"])assert.ok(login.headers.get("set-cookie").toLowerCase().includes(flag),flag);
for(const path of ["/api/terminal","/api/files/test?type=upload","/api/plugins","/api/skills/install","/api/mcp/test","/api/project-trust"])assert.equal((await post(path,{})).status,403,path);
assert.equal((await request("/api/terminal/one/events")).status,403);
const cwd=join(root,"web-test-project");
assert.equal((await post("/api/agent/new",{cwd,type:"bash",command:"echo MUST_NOT_RUN"})).status,403);
assert.equal((await post("/api/agent/new",{cwd,type:"ensure_session",toolNames:[]})).status,403);
const created=await post("/api/agent/new",{cwd,type:"ensure_session"});assert.equal(created.status,200);
const {sessionId}=await created.json();assert.ok(sessionId);
const path="/api/agent/"+encodeURIComponent(sessionId);
assert.equal((await post(path,{type:"bash",command:"echo MUST_NOT_RUN"})).status,403);
assert.equal((await post(path,{type:"set_permission_mode",mode:"ask"})).status,200);
const state=await (await request(path)).json();assert.equal(state.state.extensionStatuses.find(s=>s.key==="timrt-permission-mode").text,"ask");
async function eventsUntil(check,action){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try {
   const response=await request(path+"/events",{signal:controller.signal});assert.equal(response.status,200);
   assert.ok(response.headers.get("content-type").includes("text/event-stream"));
   assert.match(response.headers.get("cache-control"),/no-transform/);
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",acted=false;
   while(true){const {value,done}=await reader.read();if(done)throw Error("Event stream closed too early");buffer+=decoder.decode(value,{stream:true});
     if(!acted&&buffer.includes('"connected"')){acted=true;if(action)await action();}
     if(acted&&check(buffer))return;
   }
 } finally {clearTimeout(timer);controller.abort();}
}
await eventsUntil(text=>text.includes('"statusText":"plan"'),async()=>assert.equal((await post(path,{type:"set_permission_mode",mode:"plan"})).status,200));
await eventsUntil(text=>text.includes('"connected"'));
const reconnected=await (await request(path)).json();assert.equal(reconnected.state.extensionStatuses.find(s=>s.key==="timrt-permission-mode").text,"plan");
console.log("Remote HTTP authentication, cookies, CSRF, restricted APIs, permission command, SSE and reconnect: OK");
