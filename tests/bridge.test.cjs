const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {runBridge,bridgeStatus,projectGuard,pythonValue}=require('../dist/hybrid-bridge');
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hybrid-bridge-'));await fs.mkdir(path.join(dir,'results'));await fs.writeFile(path.join(dir,'status.json'),JSON.stringify({heartbeat:Date.now()/1000,session:'test',project_path:path.join(dir,'copy.project')}));return dir;}
test('stale heartbeat and wrong project never submit a request',async()=>{
 const dir=await setup();try{
  await assert.rejects(runBridge(dir,'wrong.project','result=1'),/no request submitted/);
  await assert.rejects(fs.stat(path.join(dir,'queue')));
  await fs.writeFile(path.join(dir,'status.json'),JSON.stringify({heartbeat:0}));assert.equal((await bridgeStatus(dir)).connected,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('bridge matches session/project and returns one result',async()=>{
 const dir=await setup();let worker;try{
  worker=setInterval(async()=>{
   try {const files=await fs.readdir(path.join(dir,'queue'));const file=files.find(f=>f.endsWith('.json'));if(!file)return;
    const req=JSON.parse(await fs.readFile(path.join(dir,'queue',file),'utf8'));assert.equal(req.session,'test');assert.equal(req.project_path,path.join(dir,'copy.project'));
    clearInterval(worker);await fs.writeFile(path.join(dir,'results',req.id+'.json'),JSON.stringify({id:req.id,ok:true,result:{saved:true}}));
   }catch(e){if(e.code!=='ENOENT') throw e;}
  },20);
  assert.equal((await runBridge(dir,path.join(dir,'copy.project'),'result=1',3)).saved,true);
 }finally{clearInterval(worker);await fs.rm(dir,{recursive:true,force:true});}
});
test('timeout submits once and supplies inspection path instead of retrying',async()=>{
 const dir=await setup();try{
  await assert.rejects(runBridge(dir,path.join(dir,'copy.project'),'result=1',1),/Execution may have begun/);
  assert.equal((await fs.readdir(path.join(dir,'queue'))).filter(f=>f.endsWith('.json')).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('parameter serialization cannot inject Python statements',()=>{
 const value='a"\nimport malicious\n# å';assert.ok(!pythonValue(value).includes('\nimport'));
 const script=projectGuard('C:/copy.project','Application/Subfolder');assert.ok(script.includes('len(matches) != 1'));assert.ok(script.includes('Requested project is not primary'));
});
