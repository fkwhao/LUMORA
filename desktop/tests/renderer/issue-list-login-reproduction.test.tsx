import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {CloudAccountPage} from "../../src/renderer/features/settings/pages/CloudAccountPage";
import {CloudModelCoordinator} from "../../src/main/features/cloud/cloud-model-coordinator";
afterEach(cleanup);
it("LM-019 completed authentication must be shown when no plan is available",async()=>{
 let authenticated=false;
 const session:any={
  getState:()=>({authenticated,user:authenticated?{email:"repro@test.invalid",displayName:"Repro"}:undefined}),
  restore:vi.fn(async()=>session.getState()),
  login:vi.fn(async()=>{authenticated=true;return session.getState();}),
  requestJson:vi.fn(async(path:string)=>path.endsWith("/billing/overview")?{hasActiveSubscription:false}:path.endsWith("/billing/history")?{usage:[],ledger:[]}:[]),
 };
 const coordinator=new CloudModelCoordinator(session,{load:()=>({modelSource:"CLOUD_MANAGED"})} as any,{} as any,{} as any);
 const api:any={restoreSession:()=>coordinator.restoreSession(),getState:()=>Promise.resolve(coordinator.getState()),login:(input:any)=>coordinator.login(input),getDashboard:()=>coordinator.getDashboard()};
 render(<CloudAccountPage api={api} notify={vi.fn()}/>);
 const email=await screen.findByLabelText("邮箱");
 fireEvent.change(email,{target:{value:"repro@test.invalid"}});
 fireEvent.change(screen.getByLabelText("密码"),{target:{value:"test-only"}});
 fireEvent.submit(email.closest("form")!);
 await screen.findByText("已登录");
 expect(screen.queryByLabelText("邮箱")).toBeNull();
 console.log("REPRO LM-019",JSON.stringify({authenticated:coordinator.getState().auth.authenticated,loginFormVisible:!!screen.queryByLabelText("邮箱"),error:document.querySelector(".settings-error")?.textContent}));
 expect(screen.queryByText("已登录")).not.toBeNull();
});
