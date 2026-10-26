const {cleanTrack}=require('./model.cjs');

function reconcilePlayback(info,previous){
  const ad=!!info.ad;
  if(ad){
    return {...previous,ad:true,playing:!!info.playing,status:'advertisement',
      video:true,error:info.error||'',adPosition:info.position||0,adDuration:info.duration||0};
  }
  let track=previous.track;
  if(info.title&&/^[\w-]{11}$/.test(info.id||'')){
    const same=track?.id===info.id;
    track=cleanTrack({...(same?track:{}),id:info.id,title:same?track.title:info.title,artist:(same?track.artist:info.artist)||'YouTube Music',
      album:(same?track.album:info.album)||'',image:(same?track.image:info.image)||info.image||`https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
      duration:info.duration||track?.duration||0});
  }
  const status=info.error?'error':info.ended?'ended':info.playing?'playing':info.ready>1?'paused':previous.status==='loading'?'loading':'idle';
  return {...previous,track,ad:false,adPosition:0,adDuration:0,playing:!!info.playing,
    position:Math.max(0,info.position||0),duration:info.duration||track?.duration||previous.duration||0,
    status,error:info.error||'',video:!!info.video};
}
module.exports={reconcilePlayback};
