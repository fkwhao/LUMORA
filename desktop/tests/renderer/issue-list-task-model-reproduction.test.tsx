import {act,cleanup,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {TaskPage} from "../../src/renderer/features/tasks/TaskPage";
import {createTaskStore} from "../../src/renderer/features/tasks/task-store";
afterEach(()=>{cleanup();window.localStorage.clear();});
it.each(["cloud-A","retired-model"])("LM-011 restores saved model %s or explains a fallback",async(savedModel)=>{
 const task={taskId:"issue-lm011",goal:"Repro",status:"COMPLETED",lastEventSequence:0,activeStep:"",resultSummary:"",planSteps:[],selectedModel:savedModel};
 const taskApi:any={create:vi.fn(),list:vi.fn(async()=>[]),get:vi.fn(async()=>task),updatePreferences:vi.fn(async(input:any)=>({...task,selectedModel:input.model})),subscribe:vi.fn(()=>()=>{}),decideApproval:vi.fn()};
 const modelApi:any={listModels:vi.fn(async()=>[]),getSettings:vi.fn(async()=>({providerName:"Test",baseUrl:"https://test.invalid",model:"cloud-B",apiKeyConfigured:true,contextWindow:128000,models:[]}))};
 const store=createTaskStore(taskApi,modelApi);store.setState({activeTask:task as any,messages:[]});
 const cloudApi:any={getModelCatalog:vi.fn(async()=>({state:{auth:{authenticated:true},modelSource:"CLOUD_MANAGED",selectedCloudModelCode:"cloud-B"},models:["A","B"].map(id=>({code:"cloud-"+id,displayName:"Cloud "+id,pricingVersion:"v1",providerCode:"test",protocolType:"OPENAI_COMPATIBLE",capabilities:{contextWindow:128000,maxOutputTokens:4096,reasoning:false,tools:true,vision:false,json:true,webSearch:false},publishedAt:"2026-09-01T00:00:00Z"}))}))};
 const notify=vi.fn();
 render(<TaskPage store={store} modelApi={modelApi} cloudApi={cloudApi} notify={notify}/>);
 const trigger=await screen.findByRole("button",{name:"选择模型和推理强度"});
 await waitFor(()=>expect(trigger.textContent).toMatch(/Cloud [AB]/));
 console.log("REPRO LM-011",JSON.stringify({savedTaskModel:store.getState().activeTask?.selectedModel,displayed:trigger.textContent}));
 if(savedModel==="retired-model"){
   expect(trigger).toHaveTextContent("Cloud B");
   expect(notify).toHaveBeenCalledWith(expect.stringContaining("retired-model 当前不可用"),"info");
 }else{
   expect(trigger).toHaveTextContent("Cloud A");
   await act(async()=>{store.setState({activeTask:{...task,taskId:"other-task",selectedModel:"cloud-B"} as any});});
   await waitFor(()=>expect(screen.getByRole("button",{name:"选择模型和推理强度"})).toHaveTextContent("Cloud B"));
   await act(async()=>{store.setState({activeTask:task as any});});
   await waitFor(()=>expect(screen.getByRole("button",{name:"选择模型和推理强度"})).toHaveTextContent("Cloud A"));
 }
});
