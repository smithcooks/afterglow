const {test}=require('node:test');const assert=require('node:assert/strict');const {lyricPhrases,lyricRows}=require('../ui/timing.js');
test('long lyric lines become short ordered phrases bounded by source timestamps',()=>{const text='Stole her I am the definition of a bandit uh ayy';const result=lyricPhrases([{time:10,text},{time:16,text:'Next line'}]);assert.equal(result.slice(0,-1).map(p=>p.text).join(' '),text);assert.equal(result[0].time,10);assert.ok(result.slice(0,-1).every(p=>p.time<16&&p.text.split(' ').length<=4));assert.equal(result.at(-1).time,16);for(let i=1;i<result.length;i++)assert.ok(result[i].time>=result[i-1].time);});
test('short lyrics and instrumental gaps retain their source timestamps',()=>{const lines=[{time:1,text:'Only you'},{time:3,text:''},{time:5,text:'Stay'}];assert.deepEqual(lyricPhrases(lines).map(({time,text})=>({time,text})),lines);});
test('cinema rows preserve every word and punctuation while giving the final word its own row',()=>{
  for(const text of ['Moonlight','Quiet streets','A brighter day','Moonlight over quiet streets','Stay — stars still shine','One more light beyond the city tonight']){
    const words=text.split(/\s+/),rows=lyricRows(text);
    assert.deepEqual(rows.flat(),words);
    assert.ok(rows.every(row=>row.length>0&&row.length<=2));
    assert.deepEqual(rows.at(-1),[words.at(-1)]);
  }
  assert.deepEqual(lyricRows('  A   brighter\nnew day  '),[['A','brighter'],['new'],['day']]);
  assert.deepEqual(lyricRows(' \n '),[]);
});
