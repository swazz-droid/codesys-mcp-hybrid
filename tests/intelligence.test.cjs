const {test}=require('node:test');const assert=require('node:assert/strict');
const {findReferences,getSymbols}=require('../dist/hybrid-intelligence');
const objects=[{objectPath:'Application/P',declaration:'VAR\n x, y : BOOL;\n (* fake : INT; *)\nEND_VAR',implementation:"x := GVL.x; // x\n(* x (* x *) *)\ns := 'x';\nx := FALSE;"}];
test('references ignore comments/strings and retain 1-based position and qualifier',()=>{
 const r=findReferences(objects,'X');assert.equal(r.total,4);assert.equal(r.matches[2].qualifier,'GVL');
 assert.equal(r.matches[3].line,4);assert.equal(findReferences(objects,'x',1).truncated,true);
 assert.equal(findReferences(objects,'x',100,'Other').total,0);
});
test('symbols list comma declarations and exclude comments',()=>{
 const r=getSymbols(objects);assert.deepEqual(r.symbols.map(s=>s.name),['x','y']);assert.equal(r.symbols[0].line,2);assert.equal(r.compilerResolved,false);
});
