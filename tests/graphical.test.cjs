const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepareGraphicalXml}=require('../dist/hybrid-graphical');
const {parsePlcopen}=require('../dist/hybrid-validation');
const template=`<?xml version="1.0"?><project xmlns="http://www.plcopen.org/xml/tc6_0200"><types><pous><pou name="Original"><body><LD><!--ObjectVersion: LD1--><contact localId="0"><position x="0" y="0"/><variable>A</variable></contact></LD></body><addData><data name="vendor"><ObjectId>old-guid</ObjectId><InterfaceAsPlainText><xhtml>FUNCTION_BLOCK Original
VAR
END_VAR</xhtml></InterfaceAsPlainText></data></addData></pou></pous></types><addData><ProjectStructure><Object Name="Original" ObjectId="old-guid"/></ProjectStructure></addData></project>`;
test('native template adapter retains comments/vendor data and updates matching GUID links',()=>{
 const r=prepareGraphicalXml(template,'LD','NewName',{A:'GVL.Input'});
 assert.ok(r.xml.includes('ObjectVersion: LD1'));assert.ok(r.xml.includes('GVL.Input'));
 assert.ok(r.xml.includes('FUNCTION_BLOCK NewName'));assert.ok(!r.xml.includes('old-guid'));
 const p=parsePlcopen(r.xml);assert.equal(p.types.pous.pou['@_name'],'NewName');
 assert.equal(p.types.pous.pou.addData.data.ObjectId,p.addData.ProjectStructure.Object['@_ObjectId']);
});
test('wrong language and unmatched bindings fail before writing output',()=>{
 assert.throws(()=>prepareGraphicalXml(template,'FBD','NewName'));
 assert.throws(()=>prepareGraphicalXml(template,'LD','NewName',{Missing:'X'}));
});
