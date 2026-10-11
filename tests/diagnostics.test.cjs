const {test}=require('node:test');const assert=require('node:assert/strict');
const {compileReport,readEnvelope}=require('../dist/hybrid-diagnostics');
const output = data => 'DEBUG: noise\nHYBRID_RESULT:'+JSON.stringify(data)+'\nSCRIPT_SUCCESS';
test('build initiation alone does not prove a clean compile',()=>{
 assert.equal(compileReport('SCRIPT_SUCCESS: initiated',true).status,'unknown');
 assert.equal(compileReport(output({buildCompleted:true,collectionError:'API unavailable',diagnostics:[]}),true).status,'unknown');
});
test('structured errors override successful script execution and warnings remain warnings',()=>{
 assert.equal(compileReport(output({buildCompleted:true,diagnostics:[{severity:'Error',message:'type mismatch'}]}),true).status,'failed');
 const report=compileReport(output({buildCompleted:true,diagnostics:[{severity:'Warning'}]}),true);
 assert.equal(report.status,'passed');assert.equal(report.warningCount,1);
 assert.equal(compileReport(output({buildCompleted:true,diagnostics:[]}),false).status,'failed');
});
test('ambiguous or invalid envelopes are rejected',()=>{
 assert.throws(()=>readEnvelope('HYBRID_RESULT:{}\nHYBRID_RESULT:{}'));
 assert.throws(()=>readEnvelope('HYBRID_RESULT:not json'));
});
