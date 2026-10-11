// Local, explicit SP22 verification helper. No PLC login/download/online writes.
const fs=require('node:fs/promises');const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const root=path.resolve(__dirname,'..');
const output='C:/CODESYS_AI/TestProjects/HybridRuntimeVerification';
const client=new Client({name:'hybrid-runtime-verification',version:'0.1'});
async function main(){
 const request=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'dist/bin.js'),'--codesys-path','C:/Program Files/CODESYS 3.5.22.40/CODESYS/Common/CODESYS.exe','--codesys-profile','CODESYS V3.5 SP22 Patch 4','--workspace',root],env:{...process.env,CODESYS_BRIDGE_DIR:'C:/Users/DENISA/Codex_Codesys_Bridge'},stderr:'pipe'});
 try{
  await client.connect(transport);
  for(const item of Array.isArray(request)?request:[request]) {
   const started=Date.now(); const response=await client.callTool(item,undefined,{timeout:60000}); const durationMs=Date.now()-started;
   await fs.mkdir(output,{recursive:true});
   const file=path.join(output,`${Date.now()}-${item.name}.json`);await fs.writeFile(file,JSON.stringify({request:item,durationMs,response},null,2));
   let data;try{data=JSON.parse(response.content[0].text);}catch{data={text:response.content[0].text};}
   const summary={...data};if(summary.diagnostics)summary.diagnostics=summary.diagnostics.slice(0,3);if(summary.elements){summary.returnedElementCount=summary.elements.length;summary.elements=summary.elements.slice(0,2);}if(summary.symbols)summary.symbols=summary.symbols.slice(0,3);if(summary.matches)summary.matches=summary.matches.slice(0,3);delete summary.rawOutput;
   console.log(JSON.stringify({file,durationMs,responseCharacters:response.content[0].text.length,isError:response.isError,data:summary},null,2));
   if(response.isError)process.exitCode=1;
  }
 }finally{await client.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
