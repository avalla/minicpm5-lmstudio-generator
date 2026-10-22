import type {Chat, GeneratorController} from '@lmstudio/sdk';
import {configSchematics,globalConfigSchematics} from './config';
import {MiniCPM5Parser, type ToolDefinition} from './parser';

type Message = {role:'system'|'user'|'assistant'|'tool';content:string;tool_calls?:unknown[];tool_call_id?:string};
type NativeCall = {index:number;id?:string;function?:{name?:string;arguments?:string}};
function chatMessages(chat: Chat): Message[] {
 const messages:Message[]=[];
 for (const m of chat.getMessagesArray()) {
  switch(m.getRole()) {
   case 'system': messages.push({role:'system',content:m.getText()});break;
   case 'user': messages.push({role:'user',content:m.getText()});break;
   case 'assistant': {
     const calls = m.getToolCallRequests().map((c)=>'<function name=\"'+c.name+'\">'+Object.entries(c.arguments??{}).map(([key,val])=>'<param name=\"'+key+'\">'+String(val)+'</param>').join('')+'</function>').join('');
     messages.push({role:'assistant',content:m.getText()+calls});
     break;
   }
   case 'tool': for(const result of m.getToolCallResults()) messages.push({role:'user',content:`<tool_response>\n${result.content}\n</tool_response>`});break;
  }
 }
 return messages;
}
export async function generate(ctl: GeneratorController, chat: Chat) {
 const cfg=ctl.getPluginConfig(configSchematics);
 const global=ctl.getGlobalPluginConfig(globalConfigSchematics);
 const model=cfg.get('model').trim();
 const baseUrl=global.get('baseUrl').replace(/\/$/,'');
 if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/v1$/.test(baseUrl)) throw new Error('Only local LM Studio endpoints are permitted');
 if (!model || model === 'minicpm5-tool-calling') throw new Error('Specify the underlying native MiniCPM5 model ID, not the plugin model');
 const definitions=ctl.getToolDefinitions();
 const tools=definitions.map(d=>({type:'function',function:{name:d.function.name,description:d.function.description,parameters:d.function.parameters ?? {type:'object',properties:{}}}}));
 const declared:ToolDefinition[]=tools.map(t=>({name:t.function.name,parameters:t.function.parameters as ToolDefinition['parameters']}));
 const parser=new MiniCPM5Parser(declared);
 const controller=new AbortController();
 ctl.onAborted(()=>controller.abort());
 const response=await fetch(`${baseUrl}/chat/completions`,{
   method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
   body:JSON.stringify({model,temperature:cfg.get('temperature'),stream:true,messages:chatMessages(chat),...(tools.length?{tools,tool_choice:'auto'}:{})})
 });
 if(!response.ok) throw new Error(`LM Studio HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
 if(!response.body) throw new Error('Streaming response body missing');
 const reader=response.body.getReader();
 const decoder=new TextDecoder();
 let buffer='';
 let generatedTool=false;
 const emit=(events:ReturnType<MiniCPM5Parser['feed']>)=>{
  for(const event of events){
   if(event.kind==='text') ctl.fragmentGenerated(event.text);
   if(event.kind==='invalid') throw new Error(`MiniCPM5 tool parsing failure: ${event.reason}`);
   if(event.kind==='call') {
     generatedTool=true;
     ctl.toolCallGenerationStarted();
     ctl.toolCallGenerationNameReceived(event.name);
     ctl.toolCallGenerationEnded({type:'function',name:event.name,arguments:event.args,id:`minicpm5_${Date.now()}_${Math.random().toString(36).slice(2)}`});
   }
  }
 };
 while(true){
  const {done,value}=await reader.read();
  buffer+=decoder.decode(value??new Uint8Array(),{stream:!done});
  const segments=buffer.split('\n\n');
  buffer=segments.pop()??'';
  for(const segment of segments){
   const data=segment.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim()).join('');
   if(!data || data==='[DONE]') continue;
   const parsed=JSON.parse(data) as {choices?:Array<{delta?:{content?:string|null,tool_calls?:NativeCall[]}}>} ;
   const delta=parsed.choices?.[0]?.delta;
   if(typeof delta?.content==='string') emit(parser.feed(delta.content));
   // Native calls should be supported by the runtime; do not emit them as textual XML.
   if(delta?.tool_calls?.length) throw new Error('Native streamed tool calls require a separate accumulator; disable this adapter when native tool calling works.');
  }
  if(done) break;
 }
 emit(parser.finish());
 if(generatedTool) console.info('MiniCPM5 tool calls forwarded to LM Studio');
}
