const test=require('node:test'),assert=require('node:assert/strict');
const {carouselOrder,carouselNeighbors}=require('../ui/carousel.js');
const tracks=Array.from({length:7},(_,i)=>({id:String(i),title:'Track '+i}));
test('carousel neighbors follow queue order and wrap without duplicate covers',()=>{
  const neighbors=carouselNeighbors(tracks,'0');
  assert.deepEqual(neighbors.map(n=>[n.slot,n.track.id]),[[1,'1'],[-1,'6'],[2,'2'],[-2,'5']]);
  assert.equal(carouselNeighbors(tracks,'6').find(n=>n.slot===1).track.id,'0');
  assert.equal(carouselNeighbors(tracks.slice(0,2),'0').length,1);
  assert.equal(carouselNeighbors(tracks.slice(0,1),'0').length,0);
});
test('short queues use distinct recommendations; established queues keep their order',()=>{
  assert.deepEqual(carouselOrder([tracks[0],tracks[0]],tracks[0],tracks).map(t=>t.id),['0','1','2','3','4']);
  assert.deepEqual(carouselOrder(tracks,tracks[2],tracks),tracks);
});
