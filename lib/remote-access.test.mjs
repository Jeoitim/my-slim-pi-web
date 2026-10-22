import assert from "node:assert/strict";
import test from "node:test";
import {isRemoteApiAllowed, isRemoteRequest, isRemoteHostConfigured, remoteAgentCommandError} from "./remote-access.ts";
const req = host => new Request("http://127.0.0.1/api/sessions", {headers:{host}});
test("external hosts and explicit tunnel mode always use the remote boundary",()=>{
  assert.equal(isRemoteRequest(req("127.0.0.1:30141"), {}), false);
  assert.equal(isRemoteRequest(req("localhost"), {PI_WEB_REMOTE:"1"}), true);
  for(const host of ["agent.example.org","192.168.1.3","evil.localhost","127.0.0.2"]) assert.equal(isRemoteRequest(req(host), {}),true);
  assert.equal(isRemoteHostConfigured(req("192.168.1.3"),""),false);
  assert.equal(isRemoteHostConfigured(req("agent.example.org"),"agent.example.org"),true);
  assert.equal(isRemoteHostConfigured(req("evil.example.org"),"agent.example.org"),false);
});
test("remote API allowlist blocks terminal, writes, installs, trust and credentials",()=>{
  for(const path of ["/api/terminal","/api/terminal/abc","/api/files/x","/api/plugins","/api/skills/install","/api/tools/settings","/api/models-config","/api/auth/api-key/openai","/api/mcp","/api/mcp/test","/api/project-trust","/api/cwd/browse","/api/worktrees","/api/new-upstream-endpoint"]) {
    for(const method of ["POST","PUT","PATCH","DELETE"]) assert.equal(isRemoteApiAllowed(path,method),false,path+method);
  }
  for(const path of ["/api/sessions","/api/sessions/abc/context","/api/agent/abc/events","/api/files/x","/api/models"]) assert.equal(isRemoteApiAllowed(path,"GET"),true,path);
  assert.equal(isRemoteApiAllowed("/api/agent/abc","POST"),true);
  assert.equal(isRemoteApiAllowed("/api/agent/abc/lease","POST"),true);
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal(isRemoteApiAllowed("/api/agent/abc/lease",method),false);
  assert.equal(isRemoteApiAllowed("/api/agent/abc/lease/other","POST"),false);
  assert.equal(isRemoteApiAllowed("/api/terminal/abc/events","GET"),false);
});
test("remote Agent command bodies cannot bypass the route boundary",()=>{
  for(const command of [{type:"bash",command:"echo hi"},{type:"set_tools"},{type:"reload"},{type:"unknown"},{type:"run_extension_command",name:"other",args:""},{type:"run_extension_command",name:"subagents-inspect-rpc",args:"x".repeat(8193)},{type:"prompt",message:"!echo hi"},{type:"prompt",message:"/run test"},{type:"prompt",message:"hello",toolNames:[]}]) assert.ok(remoteAgentCommandError(command));
  for(const command of [{type:"prompt",message:"Hello"},{type:"set_permission_mode",mode:"ask"},{type:"prompt",message:"/approval-mode ask"},{type:"extension_ui_response",id:"one",cancelled:true},{type:"run_extension_command",name:"subagents-inspect-rpc",args:'{"requestId":"r1"}'},{type:"abort"}]) assert.equal(remoteAgentCommandError(command),null);
});
