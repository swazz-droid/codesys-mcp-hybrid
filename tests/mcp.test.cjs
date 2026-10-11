const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs/promises');const os=require('node:os');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
test('real MCP handshake preserves core tools and exposes truthful offline hybrid gates',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hybrid-mcp-'));
 const client=new Client({name:'hybrid-test',version:'1'});
 // Node path satisfies startup existence check; no runtime tools are called.
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(__dirname,'../dist/bin.js'),'--codesys-path',process.execPath,'--codesys-profile','offline-test','--workspace',dir],stderr:'pipe',env:{...process.env,CODESYS_BRIDGE_DIR:''}});
 try{
  await client.connect(transport);
  const names=(await client.listTools()).tools.map(t=>t.name);
  for(const name of ['create_pou','set_pou_code','compile_project','native_export','native_import','backup_project','validate_plcopen_xml','validate_plcopen_xsd','validate_plcopen_semantic','compile_project_diagnostics','get_symbols','find_references','prepare_graphical_xml','import_graphical_xml','create_visualization','read_visualization']) assert.ok(names.includes(name),name);
  assert.ok(client.getInstructions().includes('Johannes'));
  const templates=(await client.listResourceTemplates()).resourceTemplates.map(r=>r.uriTemplate);
  assert.ok(templates.some(uri=>uri.includes('/structure')));assert.ok(templates.some(uri=>uri.includes('/pou/')));
  for(const operation of ['st','backup','transfer','graphical','hmi','diagnostics','intelligence']) {
   const guide=JSON.parse((await client.callTool({name:'get_workflow_guidance',arguments:{operation}})).content[0].text);
   for(const name of guide.tools) assert.ok(names.includes(name),`guidance references missing tool ${name}`);
  }
  const cap=JSON.parse((await client.callTool({name:'get_capabilities',arguments:{}})).content[0].text);
  assert.equal(cap.plcopen.xsdValidation,true);assert.equal(cap.graphical.runtimeVerified,false);assert.equal(cap.bridge.connected,false);
  assert.equal(cap.compile.diagnosticsRuntimeVerified,true);assert.equal(cap.graphical.ideApiVerified,true);
  assert.equal(cap.visualization.runtimeVerified,false);assert.equal(cap.codeIntelligence.compilerResolved,false);
  const xml=path.join(dir,'test.xml');await fs.writeFile(xml,'<project><types><pous/></types></project>');
  const ok=await client.callTool({name:'validate_plcopen_semantic',arguments:{filePath:xml}});assert.equal(ok.isError,false);
  const failed=await client.callTool({name:'validate_plcopen_semantic',arguments:{filePath:xml,expectedPous:['Missing']}});assert.equal(failed.isError,true);
  const missingBridge=await client.callTool({name:'create_visualization',arguments:{projectFilePath:'copy.project',parentPath:'Application',name:'Page',elements:[{kind:'Rectangle',x:0,y:0,width:50,height:30,text:'Start'}]}});
  assert.equal(missingBridge.isError,true);assert.ok(JSON.parse(missingBridge.content[0].text).error.includes('no request submitted'));
 }finally{await client.close();await fs.rm(dir,{recursive:true,force:true});}
});
