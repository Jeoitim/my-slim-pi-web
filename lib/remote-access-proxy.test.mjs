import assert from "node:assert/strict";
import test from "node:test";
import {createJiti} from "jiti";
import {NextRequest} from "next/server.js";
const jiti=createJiti(import.meta.url,{tsconfigPaths:true});
const {proxy}=await jiti.import("../proxy.ts");
const {POST:login}=await jiti.import("../app/api/web-auth/route.ts");
const password="disposable-test-password-only-no-real-credential";
function request(path,method="GET",headers={}){
 return new NextRequest("http://127.0.0.1:30141"+path,{method,headers:{host:"agent.example.test","x-forwarded-proto":"https",...headers}});
}
const auth={authorization:"Basic "+Buffer.from("pi:"+password).toString("base64")};
test("remote authentication, exact Host, CSRF and Web feature parity",async t=>{
 const saved={...process.env};
 t.after(()=>{for(const key of ["PI_WEB_PASSWORD","PI_WEB_ALLOWED_HOSTS","PI_WEB_REMOTE"]){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
 process.env.PI_WEB_ALLOWED_HOSTS="agent.example.test";
 process.env.PI_WEB_REMOTE="1";
 delete process.env.PI_WEB_PASSWORD;
 assert.equal(proxy(request("/api/sessions")).status,403);
 process.env.PI_WEB_PASSWORD=password;
 assert.equal(proxy(request("/api/sessions")).status,401);
 assert.equal(proxy(request("/api/sessions","GET",auth)).status,200);
 assert.equal(proxy(request("/api/sessions","GET",{...auth,host:"other.example.test"})).status,403);
 assert.equal(proxy(request("/api/agent/one","POST",{...auth,origin:"https://attacker.test","sec-fetch-site":"cross-site"})).status,403);
 assert.equal(proxy(request("/api/agent/one/events","GET",{...auth,origin:"https://agent.example.test","sec-fetch-site":"same-origin"})).status,200);
 for(const [path,method] of [["/api/sessions/one","PATCH"],["/api/sessions/one","DELETE"],["/api/terminal","POST"],["/api/terminal/one/events","GET"],["/api/plugins","POST"],["/api/files/x?type=upload","POST"],["/api/models-config","PUT"],["/api/mcp/test","POST"],["/api/project-trust","POST"]])assert.equal(proxy(request(path,method,auth)).status,200,`${method} ${path}`);
 for(const [path,method] of [["/api/open-in-explorer","POST"],["/api/new-upstream-endpoint","POST"]])assert.equal(proxy(request(path,method,auth)).status,403,path);
 assert.equal(proxy(request("/api/sessions/one","PATCH",{...auth,origin:"https://attacker.test","sec-fetch-site":"cross-site"})).status,403);
 const response=await login(new NextRequest("http://127.0.0.1:30141/api/web-auth",{method:"POST",headers:{host:"agent.example.test","x-forwarded-proto":"https","content-type":"application/json"},body:JSON.stringify({password})}));
 assert.equal(response.status,200);
 const cookie=response.headers.get("set-cookie");
 for(const flag of ["HttpOnly","Secure","SameSite=lax"])assert.ok(cookie.toLowerCase().includes(flag.toLowerCase()),flag);
});
