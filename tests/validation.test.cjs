const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {validateSemantic,validateXsd} = require('../dist/hybrid-validation');
const graph = (nodes, name='Demo') => `<project xmlns="http://www.plcopen.org/xml/tc6_0200"><types><pous><pou name="${name}"><body><LD>${nodes}</LD></body></pou></pous></types></project>`;
const contact = id => `<contact localId="${id}"><position x="0" y="0"/></contact>`;
test('graph references resolve within body and normalized IDs collide', () => {
 assert.equal(validateSemantic(graph(contact('1')+contact('01'))).valid,false);
 assert.equal(validateSemantic(graph(contact('1')+'<coil localId="2"><position x="1" y="1"/><connectionPointIn><connection refLocalId="1"/></connectionPointIn></coil>')).valid,true);
 assert.equal(validateSemantic(graph(contact('1')+'<coil localId="2"><position x="1" y="1"/><connectionPointIn><connection refLocalId="9"/></connectionPointIn></coil>')).issues[0].code,'DANGLING_CONNECTION');
});
test('partial exports are allowed; expected POUs must exist; malformed and DTD XML fail',()=>{
 assert.equal(validateSemantic('<project><types><pous/></types></project>').valid,true);
 assert.equal(validateSemantic(graph(contact('1')),['Missing']).valid,false);
 assert.equal(validateSemantic('<project>').valid,false);
 assert.equal(validateSemantic('<!DOCTYPE project><project/>').valid,false);
});
test('external library types warn instead of rejecting project based exports',()=>{
 const xml='<project><types><pous><pou name="P"><interface><localVars><variable name="t"><type><derived name="TON"/></type></variable></localVars></interface><body><ST/></body></pou></pous></types></project>';
 const report=validateSemantic(xml); assert.equal(report.valid,true);assert.equal(report.warnings.length,1);
 assert.equal(validateSemantic(xml,[],['TON']).warnings.length,0);
});
test('interface manifest catches omitted variables and changed simple initializers',()=>{
 const xml='<project><types><pous><pou name="P"><interface><localVars><variable name="x"><type><INT/></type><initialValue><simpleValue value="2"/></initialValue></variable></localVars></interface><body><ST/></body></pou></pous></types></project>';
 assert.equal(validateSemantic(xml,[],[],{P:[{name:'x',type:'INT',initialValue:'2'}]}).valid,true);
 assert.equal(validateSemantic(xml,[],[],{P:[{name:'x',initialValue:'3'},{name:'y'}]}).issues.length,2);
});
test('CODESYS project exports validate embedded POUs rather than treating empty types/pous as empty project',()=>{
 const pou='<pou name="P"><body><LD><coil localId="1"><position x="0" y="0"/><connectionPointIn><connection refLocalId="7"/></connectionPointIn></coil></LD></body></pou>';
 const xml='<project><types><pous/></types><addData><data><resource name="Application"><addData><data>'+pou+'</data></addData></resource></data></addData></project>';
 const r=validateSemantic(xml,['P']);assert.equal(r.counts.embeddedPous,1);assert.equal(r.valid,false);assert.equal(r.issues[0].code,'DANGLING_CONNECTION');
});
test('XSD engine rejects schema-invalid XML and accepts valid XML', {skip:process.platform!=='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hybrid-xsd-'));
 try {
  const xsd=path.join(dir,'schema.xsd'),xml=path.join(dir,'input.xml');
  await fs.writeFile(xsd,'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="project"><xs:complexType><xs:attribute name="name" type="xs:string" use="required"/></xs:complexType></xs:element></xs:schema>');
  await fs.writeFile(xml,'<project name="valid"/>');assert.equal((await validateXsd(xml,xsd)).valid,true);
  await fs.writeFile(xml,'<project/>');assert.equal((await validateXsd(xml,xsd)).valid,false);
  await fs.writeFile(xml,'<!DOCTYPE project [<!ENTITY x SYSTEM "file:///does-not-exist">]><project name="&x;"/>');assert.equal((await validateXsd(xml,xsd)).valid,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
