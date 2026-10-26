const {test}=require('node:test');const assert=require('node:assert/strict');const {reconcilePlayback}=require('../src/playback.cjs');
const song={id:'ZengOKCUBHo',title:'Righteous',artist:'Juice WRLD',duration:229,image:'https://i.ytimg.com/vi/ZengOKCUBHo/hqdefault.jpg'};
test('pre-roll and mid-roll ads preserve song metadata and progress',()=>{
  const before={track:song,position:40,duration:229,status:'playing',playing:true,video:true};
  const ad=reconcilePlayback({ad:true,id:'6h38AY5scSM',title:'Advertisement',artist:'Advertiser',playing:true,position:4,duration:15,ended:false},before);
  assert.equal(ad.track.title,'Righteous');assert.equal(ad.track.id,song.id);assert.equal(ad.duration,229);assert.equal(ad.position,40);assert.equal(ad.status,'advertisement');assert.equal(ad.adDuration,15);
  const resumed=reconcilePlayback({...song,ad:false,position:41,duration:229,ready:4,playing:true,video:true},ad);
  assert.equal(resumed.ad,false);assert.equal(resumed.status,'playing');assert.equal(resumed.position,41);assert.equal(resumed.track.title,'Righteous');
});
test('a naturally advancing YouTube queue updates the song identity',()=>{
  const next=reconcilePlayback({id:'mzB1VGEGcSU',title:'Lucid Dreams',artist:'Juice WRLD',position:1,duration:240,ready:4,playing:true,video:true},{track:song,duration:229});
  assert.equal(next.track.id,'mzB1VGEGcSU');assert.equal(next.duration,240);assert.equal(next.status,'playing');
});
test('selected artwork and clean titles remain stable during same-song player updates',()=>{
  const next=reconcilePlayback({id:song.id,title:'Juice WRLD - Righteous (Official Video)',artist:'JuiceWRLDVEVO',image:'https://i.ytimg.com/vi/ZengOKCUBHo/default.jpg',position:30,duration:228,ready:4,playing:true},{track:song});
  assert.equal(next.track.image,song.image);assert.equal(next.track.title,song.title);assert.equal(next.track.artist,song.artist);assert.equal(next.position,30);
});
