const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function railHarness(){
  const source=fs.readFileSync(path.join(__dirname,'../ui/app.js'),'utf8');
  const start=source.indexOf('async function loadArtistRail('),end=source.indexOf('function renderRail(',start);
  assert.ok(start>=0&&end>start,'Use the production artist lookup function');
  const pending=[],renders=[];
  const context={URLSearchParams,
    request:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})),
    renderRail:()=>renders.push(context.snapshot()),
  };
  vm.runInNewContext(`let railArtist='',railRequest=0,railTracks=[],current=null;
    ${source.slice(start,end)}
    globalThis.select=track=>{current=track;return loadArtistRail(track);};
    globalThis.snapshot=()=>({current:current?.id,recommendations:Array.from(railTracks,t=>t.id)});`,context);
  return {select:context.select,pending,renders};
}
const track=(id,artist,extra={})=>({id,artist,...extra});

test('current queue artwork renders immediately while artist recommendations are pending',async()=>{
  const h=railHarness();
  const first=h.select(track('a','Artist A'));
  assert.equal(h.renders.length,1,'Render the saved queue before the network resolves');
  assert.equal(h.renders[0].current,'a');
  h.pending[0].resolve({tracks:[track('a','Artist A'),track('recommended-a','Artist A')]});await first;
  assert.equal(h.renders.at(-1).recommendations.join(','),'recommended-a');
  const second=h.select(track('b','Artist B'));
  assert.equal(h.renders.at(-1).current,'b');
  assert.equal(h.renders.at(-1).recommendations.length,0,'Do not retain another artist\'s covers during loading');
  h.pending[1].resolve({tracks:[track('recommended-b','Artist B')]});await second;
  await h.select(track('b2','Artist B'));
  assert.equal(h.pending.length,2,'A same-artist song uses the cached recommendations');
  assert.equal(h.renders.at(-1).current,'b2');
});

test('a superseded artist response or failure cannot replace the latest rail',async()=>{
  const h=railHarness();
  const first=h.select(track('a','Artist A'));
  const second=h.select(track('b','Artist B'));
  h.pending[1].resolve({tracks:[track('recommended-b','Artist B')]});await second;
  const renderCount=h.renders.length;
  h.pending[0].resolve({tracks:[track('obsolete-a','Artist A')]});await first;
  assert.equal(h.renders.length,renderCount);
  assert.equal(h.renders.at(-1).recommendations.join(','),'recommended-b');
  const third=h.select(track('c','Artist C'));
  const fourth=h.select(track('d','Artist D'));
  const immediateCount=h.renders.length;
  h.pending[2].reject(new Error('Old lookup failed'));await third;
  assert.equal(h.renders.length,immediateCount,'A stale failure must not repaint the active song');
  h.pending[3].resolve({tracks:[]});await fourth;
});

test('local songs and songs without an artist invalidate pending online recommendations',async()=>{
  for(const replacement of [track('local','Artist A',{localId:'file-1'}),track('unknown','')]){
    const h=railHarness(),lookup=h.select(track('a','Artist A'));
    await h.select(replacement);
    assert.equal(h.renders.at(-1).current,replacement.id);
    assert.equal(h.renders.at(-1).recommendations.length,0);
    const renderCount=h.renders.length;
    h.pending[0].resolve({tracks:[track('obsolete-a','Artist A')]});await lookup;
    assert.equal(h.renders.length,renderCount);
    assert.equal(h.pending.length,1,'Local and unknown artists do not start another online lookup');
  }
});
