const {app,BaseWindow,BrowserWindow,WebContentsView,ipcMain,Menu,Tray,nativeImage,globalShortcut,dialog,screen,session,desktopCapturer,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto');
const {Store,cleanTrack,nextQueueIndex}=require('./model.cjs');const {createServer}=require('./server.cjs');
const {reconcilePlayback}=require('./playback.cjs');
const {enableAdBlocking}=require('./adblock.cjs');
const root=path.resolve(__dirname,'..');const dataDir=path.join(root,'.afterglow-data');
fs.mkdirSync(dataDir,{recursive:true});app.setName('Afterglow');app.setPath('userData',dataDir);app.setPath('sessionData',path.join(dataDir,'session'));app.setPath('crashDumps',path.join(dataDir,'crashes'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let win,ui,engine,tray,service,store;let sourceMode=false,compact=false,quitting=false,pollBusy=false,sourceStyleKey=null,modeBeforeCompact=null;
let styleUpdate=Promise.resolve(),wasDesktop=false,normalBounds=null;
let queueFinished=false,lastEndedSequence=-1;
let adProtection=null,pendingTrackId=null;
let state={status:'idle',playing:false,position:0,duration:0,volume:65,track:null,error:'',video:false,ad:false};let playSequence=0;
const stateFile=path.join(dataDir,'runtime.json');
const logFile=path.join(dataDir,'app.log');
function log(...values){try{fs.appendFileSync(logFile,new Date().toISOString()+' '+values.map(x=>x?.stack||String(x)).join(' ')+'\n');}catch{}}
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});
process.on('uncaughtException',error=>{log(error);if(ui&&!ui.webContents.isDestroyed())emit('notice',{message:'An application error occurred. Details were saved to app.log.'});});
process.on('unhandledRejection',error=>log(error));
function emit(name,data){service?.broadcast(name,data);}
function setState(patch){state={...state,...patch};emit('playback',state);}
function trustedNavigation(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='music.youtube.com'||u.hostname==='www.youtube.com'||u.hostname==='youtube.com'||u.hostname==='accounts.google.com'||u.hostname==='consent.youtube.com'||u.hostname==='consent.google.com');}catch{return url==='about:blank';}}
function layout(){if(!win||!ui||!engine)return;const {width,height}=win.getContentBounds();engine.setBounds({x:0,y:sourceMode?48:0,width,height:Math.max(1,height-(sourceMode?48:0))});ui.setBounds({x:0,y:0,width,height:sourceMode?48:height});engine.setVisible(!compact);}
async function applyBackgroundStyle(){
  const contents=engine?.webContents;
  if(quitting||!contents||contents.isDestroyed()||!contents.getURL().startsWith('https://music.youtube.com'))return;
  if(sourceStyleKey){try{await contents.removeInsertedCSS(sourceStyleKey);}catch{}sourceStyleKey=null;}
  if(quitting||contents.isDestroyed())return;
  if(!sourceMode)sourceStyleKey=await contents.insertCSS(`
    html,body{background:#08090c!important;overflow:hidden!important;margin:0!important;padding:0!important;width:100vw!important;height:100vh!important}
    body *{visibility:hidden!important;transform:none!important;transform-style:flat!important;translate:none!important;rotate:none!important;scale:none!important;contain:none!important;content-visibility:visible!important;container-type:normal!important;zoom:1!important;filter:none!important;backdrop-filter:none!important;perspective:none!important;will-change:auto!important;overflow:visible!important;clip-path:none!important}
    ytmusic-app,ytmusic-app-layout,ytmusic-player-page,ytmusic-player,#player,#movie_player,.html5-video-container{position:static!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important}
    body [data-afterglow-video-parent]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important}
    video{visibility:visible!important;display:block!important;position:fixed!important;inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;min-width:100vw!important;min-height:100vh!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:center center!important;margin:0!important;padding:0!important;z-index:2147483600!important;opacity:1!important}
    .ad-showing video,.ad-interrupting video{visibility:hidden!important}
  `,{cssOrigin:'user'});
}
function backgroundStyle(){styleUpdate=styleUpdate.catch(()=>{}).then(applyBackgroundStyle);return styleUpdate;}
function leaveCompact(){if(!compact)return;compact=false;win.setResizable(true);win.setMinimumSize(900,620);if(modeBeforeCompact)win.setBounds(modeBeforeCompact);win.setAlwaysOnTop(!!store.data.settings.alwaysOnTop,'floating');}
async function showSource(enabled=true){leaveCompact();sourceMode=enabled;win.setIgnoreMouseEvents(false);win.setSkipTaskbar(false);layout();await backgroundStyle();emit('window-mode',{source:sourceMode,compact:false,desktop:store.data.settings.desktopMode});if(enabled){if(!engine.webContents.getURL()||engine.webContents.getURL()==='about:blank')engine.webContents.loadURL('https://music.youtube.com').catch(log);win.show();win.focus();}}
async function remoteCommand(command,value){
  if(quitting||!engine?.webContents||engine.webContents.isDestroyed()||!engine.webContents.getURL())return;
  const commands={
    toggle:`window.__afterglowTransport=(window.__afterglowTransport||0)+1;const v=document.querySelector('video');const p=document.querySelector('#movie_player');if(v){if(v.paused){if(p?.playVideo)p.playVideo();else await v.play();}else{p?.pauseVideo?.();v.pause();}}`,
    play:`window.__afterglowTransport=(window.__afterglowTransport||0)+1;const v=document.querySelector('video');const p=document.querySelector('#movie_player');if(p?.playVideo)p.playVideo();else if(v)await v.play();`,
    pause:`window.__afterglowTransport=(window.__afterglowTransport||0)+1;document.querySelector('#movie_player')?.pauseVideo?.();document.querySelector('video')?.pause();`,
    stop:`document.querySelector('#movie_player')?.stopVideo?.();document.querySelector('video')?.pause();`,
    seek:`const token=window.__afterglowTransport=(window.__afterglowTransport||0)+1;const v=document.querySelector('video');const p=document.querySelector('#movie_player');if(v){const paused=${!state.playing};const keepPaused=()=>{if(paused&&window.__afterglowTransport===token){p?.pauseVideo?.();v.pause();}};v.addEventListener('seeked',keepPaused,{once:true});if(p?.seekTo)p.seekTo(${Math.max(0,Number(value)||0)},true);else v.currentTime=${Math.max(0,Number(value)||0)};keepPaused();if(paused)setTimeout(keepPaused,350);}`,
    volume:`const v=document.querySelector('video');if(v){v.volume=${Math.min(1,Math.max(0,Number(value)/100||0))};v.muted=false;}`,
    next:`document.querySelector('.next-button')?.click();`,
    previous:`document.querySelector('.previous-button')?.click();`,
  };
  if(!commands[command])return;
  return engine.webContents.executeJavaScript(`(async()=>{${commands[command]};return true})()`,true).catch(error=>log('Player command',command,error.message));
}
async function playTrack(raw){
  const sequence=++playSequence;queueFinished=false;const track=cleanTrack(raw);pendingTrackId=track.id;store.remember(track);emit('library',store.snapshot());
  if(track.localId){await remoteCommand('pause');setState({track,playing:false,position:0,duration:track.duration,status:'loading',error:'',video:false,ad:false});emit('play-local',{track,url:'/local/'+track.localId});return;}
  try{await adProtection.ready;}catch(error){setState({status:'error',error:'Ad protection could not start. Please restart the app and try again.'});throw error;}
  emit('stop-local',{});setState({track,playing:false,position:0,duration:track.duration,status:'loading',error:'',video:false,ad:false});
  if(sourceMode)await showSource(false);
  await remoteCommand('stop');
  if(sequence!==playSequence||quitting)return;
  for(let attempt=0;attempt<2;attempt++){
    try{await engine.webContents.loadURL(`https://music.youtube.com/watch?v=${track.id}`);break;}
    catch(error){if(sequence!==playSequence||quitting)return;if(error.code==='ERR_ABORTED'&&attempt===0){engine.webContents.stop();await engine.webContents.loadURL('about:blank').catch(log);sourceStyleKey=null;continue;}log(error.message);setState({status:'error',error:'YouTube Music could not load. Open the source player to retry.'});return;}
  }
  if(sequence!==playSequence)return;
  await backgroundStyle();
  let mediaReady=false;
  for(let i=0;i<30;i++){
    if(sequence!==playSequence||state.track?.id!==track.id||quitting)break;
    const ready=await engine.webContents.executeJavaScript(`(()=>{const v=document.querySelector('video');const p=document.querySelector('#movie_player');const id=p?.getVideoData?.().video_id;if(v&&id===${JSON.stringify(track.id)}){v.volume=${store.data.settings.volume/100};if(p?.playVideo)p.playVideo();else v.play().catch(()=>{});return v.readyState>1}return false})()`,true).catch(()=>false);
    if(ready){mediaReady=true;break;}await new Promise(resolve=>setTimeout(resolve,700));
  }
  if(!mediaReady&&sequence===playSequence&&state.status==='loading')setState({status:'error',error:'YouTube is still loading. Open the source player to check for consent, sign-in, or a regional restriction.'});
}
async function navigateQueue(previous=false,ended=false,skipRestart=false){
  if(state.ad)return;
  if(ended&&store.data.settings.repeat==='one'&&state.track)return playTrack(state.track);
  if(previous&&state.position>3&&!skipRestart){if(state.track?.localId)emit('local-control',{command:'seek',value:0});else await remoteCommand('seek',0);return;}
  const navigationSettings=skipRestart?{...store.data.settings,repeat:'all',shuffle:false}:store.data.settings;
  const next=nextQueueIndex(store.data.queue,state.track?.id,navigationSettings,previous);
  if(next>=0)return playTrack(store.data.queue[next]);
  if(ended){queueFinished=store.data.queue.length>0;if(queueFinished)await remoteCommand('stop');setState({playing:false,status:'paused',position:state.duration,video:false});return;}
  if(!state.track?.localId)await remoteCommand(previous?'previous':'next');
}
async function poll(){
  if(pollBusy||quitting||state.track?.localId||!engine||engine.webContents.isDestroyed()||!engine.webContents.getURL().startsWith('https://music.youtube.com'))return;
  pollBusy=true;const sequence=playSequence;
  try{
    const info=await engine.webContents.executeJavaScript(`(()=>{const v=document.querySelector('video');const p=document.querySelector('#movie_player');const m=navigator.mediaSession?.metadata;const d=p?.getVideoData?.()||{};const r=p?.getPlayerResponse?.();const title=d.title||document.querySelector('ytmusic-player-bar .title')?.textContent?.trim()||m?.title||'';const ad=!!(p?.classList.contains('ad-showing')||p?.classList.contains('ad-interrupting')||d.isAd);return {url:location.href,title,ad,artist:d.author||m?.artist||'',album:m?.album||'',image:m?.artwork?.at(-1)?.src||'',id:d.video_id||new URL(location.href).searchParams.get('v')||'',playing:v?!v.paused:false,position:v?.currentTime||0,duration:Number.isFinite(v?.duration)?v.duration:0,ready:v?.readyState||0,ended:v?.ended||false,video: r?.videoDetails?.musicVideoType==='MUSIC_VIDEO_TYPE_OMV'||r?.videoDetails?.musicVideoType==='MUSIC_VIDEO_TYPE_UGC',error:v?.error?.message||document.querySelector('yt-playability-error-supported-renderers')?.textContent?.trim()||'',hasVideo:!!v}})()`);
    if(sequence!==playSequence)return;
    if(pendingTrackId&&!info.ad){if(info.id!==pendingTrackId)return;if(info.ready>1)pendingTrackId=null;}
    if(queueFinished&&!sourceMode){if(info.playing)remoteCommand('pause');return;}
    if(!state.track&&!info.title)return;
    const next=reconcilePlayback(info,state);
    if(!next.ad&&state.track?.id!==next.track?.id&&next.track){store.remember(next.track);emit('library',store.snapshot());}
    const wasEnded=state.status==='ended';
    setState(next);
    if(!info.ad&&info.ended&&!wasEnded&&lastEndedSequence!==playSequence){lastEndedSequence=playSequence;await navigateQueue(false,true);}
  }catch(error){log('Polling:',error.message);}finally{pollBusy=false;}
}
function applySettings(){
  if(!win)return;const s=store.data.settings;
  win.setAlwaysOnTop(!!s.alwaysOnTop,'floating');
  if(s.desktopMode&&!compact&&!sourceMode){if(!wasDesktop)normalBounds=win.getBounds();win.setBounds(screen.getDisplayMatching(win.getBounds()).workArea);win.setSkipTaskbar(true);}else{win.setSkipTaskbar(false);if(wasDesktop&&!s.desktopMode&&normalBounds&&!compact)win.setBounds(normalBounds);}
  wasDesktop=!!s.desktopMode;
  if(!s.desktopMode)win.setIgnoreMouseEvents(false);
  remoteCommand('volume',s.volume);state.volume=s.volume;emit('settings',s);emit('window-mode',{source:sourceMode,compact,desktop:s.desktopMode});
}
async function windowAction(command,payload){
  if(command==='minimize')win.minimize();
  else if(command==='close'){win.close();return {closed:true};}
  else if(command==='quit'){quitting=true;setTimeout(()=>app.quit(),50);return {quitting:true};}
  else if(command==='fullscreen'){win.setFullScreen(!win.isFullScreen());emit('fullscreen',win.isFullScreen());}
  else if(command==='leave-fullscreen'){win.setFullScreen(false);}
  else if(command==='source')return showSource(payload!==false);
  else if(command==='compact'){
    if(sourceMode)await showSource(false);
    compact=!compact;
    if(compact){modeBeforeCompact=win.getBounds();win.setFullScreen(false);win.setMinimumSize(440,160);const display=screen.getDisplayMatching(win.getBounds()).workArea;win.setBounds({x:display.x+display.width-510,y:display.y+display.height-230,width:480,height:180});win.setAlwaysOnTop(true,'floating');win.setResizable(false);}
    else{win.setResizable(true);win.setMinimumSize(900,620);win.setBounds(modeBeforeCompact||{width:1320,height:850});applySettings();}
    layout();emit('window-mode',{compact,source:false,desktop:store.data.settings.desktopMode});win.show();
  }else if(command==='interactive'&&store.data.settings.desktopMode&&!sourceMode&&!compact)win.setIgnoreMouseEvents(!payload,{forward:true});
  else if(command==='display'){
    const displays=screen.getAllDisplays();const target=displays.find(d=>d.id===Number(payload));if(target){win.setBounds(target.workArea);win.show();}
  }else if(command==='external'&&typeof payload==='string'){
    const u=new URL(payload);if(u.protocol==='https:'&&['music.youtube.com','www.youtube.com','lrclib.net'].includes(u.hostname))await shell.openExternal(u.href);
  }
  return {compact,source:sourceMode,fullscreen:win.isFullScreen()};
}
const controller={
  getState:()=>({...state,protection:adProtection?.state||{enabled:false}}),applySettings,
  async action(action,payload){
    if(action==='play')return playTrack(payload);
    if(action==='toggle'){
      if(queueFinished&&state.track)return playTrack(state.track);
      if(state.track?.localId)emit('local-control',{command:'toggle'});
      else if(!state.track&&store.lastTrack)await playTrack(store.lastTrack);
      else await remoteCommand('toggle');return;
    }
    if(action==='resume'||action==='pause'){
      if(action==='resume'&&queueFinished&&state.track)return playTrack(state.track);
      if(state.track?.localId)emit('local-control',{command:action==='resume'?'play':'pause'});
      else if(action==='resume'&&!state.track&&store.lastTrack)await playTrack(store.lastTrack);
      else await remoteCommand(action==='resume'?'play':'pause');return;
    }
    if(action==='next'||action==='previous')return navigateQueue(action==='previous',false,payload?.fromSwipe===true);
    if(action==='seek'){if(!Number.isFinite(payload))throw new Error('Invalid position');if(state.ad)throw new Error('Seeking is available when the song starts.');if(state.track?.localId)emit('local-control',{command:'seek',value:payload});else await remoteCommand('seek',payload);return;}
    if(action==='local-state'){
      if(!state.track?.localId)return;
      const p=payload||{};setState({position:Math.max(0,Number(p.position)||0),duration:Math.max(0,Number(p.duration)||0),playing:!!p.playing,status:p.error?'error':p.ended?'ended':p.playing?'playing':'paused',error:String(p.error||'').slice(0,400),video:false});if(p.ended)await navigateQueue(false,true);return;
    }
    if(action==='window')return windowAction(payload.command,payload.value);
    if(action==='displays')return screen.getAllDisplays().map((d,i)=>({id:d.id,label:d.label||`Display ${i+1}`,primary:d.id===screen.getPrimaryDisplay().id}));
    if(action==='import-audio'){
      const result=await dialog.showOpenDialog({title:'Add your music',properties:['openFile','multiSelections'],filters:[{name:'Audio and video',extensions:['mp3','m4a','flac','wav','ogg','opus','aac','mp4','webm']}]});
      const tracks=[];for(const file of result.filePaths){const existing=Object.entries(store.localFiles).find(([,v])=>v.path===file);const id=existing?.[0]||crypto.randomUUID();const track={id,localId:id,title:path.basename(file,path.extname(file)),artist:'Local files',duration:0,kind:'local',image:''};store.localFiles[id]={path:file,track};tracks.push(track);}
      store.save();emit('library',store.snapshot());return tracks;
    }
    if(action==='import-wallpaper'){
      const result=await dialog.showOpenDialog({title:'Choose a wallpaper',properties:['openFile'],filters:[{name:'Images and video',extensions:['jpg','jpeg','png','webp','gif','mp4','webm']}]});
      if(result.canceled)return null;store.wallpaperFile=result.filePaths[0];store.settings({backdrop:'custom'});const ext=path.extname(store.wallpaperFile).toLowerCase();const info={type:['.mp4','.webm'].includes(ext)?'video':'image',stamp:Date.now()};fs.writeFileSync(path.join(dataDir,'wallpaper-type.json'),JSON.stringify(info));emit('wallpaper',info);emit('library',store.snapshot());return info;
    }
    if(action==='wallpaper-info'){try{return JSON.parse(fs.readFileSync(path.join(dataDir,'wallpaper-type.json'),'utf8'));}catch{return {type:'image',stamp:0};}}
    if(action==='import-lyrics'){
      const result=await dialog.showOpenDialog({title:'Load synced lyrics',properties:['openFile'],filters:[{name:'LRC lyrics',extensions:['lrc']}]});if(result.canceled)return null;
      return {lines:require('./model.cjs').parseLrc(fs.readFileSync(result.filePaths[0],'utf8')),source:'Local LRC'};
    }
    if(action==='verify-motion'&&process.env.AFTERGLOW_VERIFY_UI==='1'){
      const {sampleMotion}=require('./verify.cjs');const report=await ui.webContents.executeJavaScript('('+sampleMotion.toString()+')()');
      fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});fs.writeFileSync(path.join(root,'screenshots/motion-verification.json'),JSON.stringify({at:new Date().toISOString(),layout:store.data.settings.layout,...report},null,2));return report;
    }
    if(action==='verify-inspect'&&process.env.AFTERGLOW_VERIFY_UI==='1'){
      const {inspectVideo,inspectUI}=require('./verify.cjs');
      return {state:controller.getState(),ui:await ui.webContents.executeJavaScript('('+inspectUI.toString()+')()'),engine:engine.webContents.getURL().startsWith('https://music.youtube.com')?await engine.webContents.executeJavaScript('('+inspectVideo.toString()+')()'):null};
    }
    if(action==='verify-snapshot'&&process.env.AFTERGLOW_VERIFY_UI==='1'){
      const name=String(payload?.name||payload||'player').replace(/[^a-z0-9-]/gi,'').slice(0,40)||'player';const directory=path.join(root,'screenshots');fs.mkdirSync(directory,{recursive:true});
      const videoGeometry=engine.webContents.getURL().startsWith('https://music.youtube.com')?await engine.webContents.executeJavaScript(`(()=>{const v=document.querySelector('video');const r=v?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},video:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}})()`).catch(()=>null):null;
      const diagnostics={visible:win.isVisible(),minimized:win.isMinimized(),focused:win.isFocused(),bounds:win.getBounds(),uiBounds:ui.getBounds(),engineBounds:engine.getBounds(),uiUrl:ui.webContents.getURL(),videoGeometry};fs.writeFileSync(path.join(directory,name+'-window.json'),JSON.stringify(diagnostics,null,2));
      ui.webContents.invalidate();await new Promise(resolve=>setTimeout(resolve,200));
      const capture=contents=>Promise.race([contents.capturePage(undefined,{stayAwake:true,stayHidden:true}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Renderer screenshot timed out')),8000))]);
      const overlay=await capture(ui.webContents);fs.writeFileSync(path.join(directory,name+'.png'),overlay.toPNG());
      if(state.video){const background=await capture(engine.webContents);fs.writeFileSync(path.join(directory,name+'-video.png'),background.toPNG());}
      const geometry=await ui.webContents.executeJavaScript(`(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,visible:!!(b.width&&b.height)&&!e.hidden}};return {viewport:{width:innerWidth,height:innerHeight},clock:r('#clock-block'),cover:r('.album-card'),lyrics:r('#lyrics-panel'),dock:r('#player-dock'),rail:r('#desktop-rail'),library:r('#library-panel'),panels:[...document.querySelectorAll('.glass-panel')].filter(e=>!e.hidden).map(e=>e.id)}})()`);
      const typography=await ui.webContents.executeJavaScript(`(()=>{const data={};for(const s of ['.rail-heading>span','.rail-track>span','.rail-track small','.dock-track strong','.dock-track small','.album-caption strong','.album-caption span']){const e=document.querySelector(s);if(e)data[s]={fontSize:getComputedStyle(e).fontSize,color:getComputedStyle(e).color};}return data})()`);
      const result={name,at:new Date().toISOString(),state:controller.getState(),geometry,typography,bounds:win.getContentBounds()};fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify(result,null,2));return result;
    }
    throw new Error('Unknown action');
  }
};
async function start(){
  store=new Store(dataDir);state.volume=store.data.settings.volume;
  service=await createServer({store,controller,port:Number(process.env.AFTERGLOW_PORT)||0});
  fs.writeFileSync(stateFile,JSON.stringify({origin:service.origin,pid:process.pid,started:new Date().toISOString()}));
  const icon=path.join(root,'ui/assets/icon.png');
  win=new BaseWindow({width:1360,height:880,minWidth:900,minHeight:620,frame:false,show:false,backgroundColor:'#08090c',title:'Afterglow',icon});
  const remoteSession=session.fromPartition('persist:youtube');
  adProtection=enableAdBlocking(remoteSession,dataDir);adProtection.ready.then(()=>log('Ad protection enabled')).catch(error=>log('Ad protection failed',error));
  remoteSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  remoteSession.setPermissionCheckHandler(()=>false);
  const agent=remoteSession.getUserAgent().replace(/\s(?:Electron|Afterglow|afterglow-player)\/[^\s]+/g,'');remoteSession.setUserAgent(agent);
  engine=new WebContentsView({webPreferences:{partition:'persist:youtube',preload:path.join(__dirname,'engine-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  engine.setBackgroundColor('#08090c');
  ui=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});ui.setBackgroundColor('#00000000');
  win.contentView.addChildView(engine);win.contentView.addChildView(ui);layout();
  engine.webContents.setWindowOpenHandler(({url})=>{if(trustedNavigation(url)){engine.webContents.loadURL(url);showSource(true);}return {action:'deny'};});
  engine.webContents.on('will-navigate',(event,url)=>{if(!trustedNavigation(url))event.preventDefault();});
  engine.webContents.on('did-finish-load',()=>backgroundStyle().catch(log));
  engine.webContents.on('did-fail-load',(_e,code,description)=>{if(code!==-3){log('YouTube load',description);setState({status:'error',error:'Could not connect to YouTube Music. Check your connection or open the source player.'});}});
  ui.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  ui.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(service.origin+'/'))event.preventDefault();});
  ui.webContents.on('console-message',details=>{if(details.level==='error')log('UI:',details.message);});
  const localSession=ui.webContents.session;
  localSession.setPermissionRequestHandler((wc,permission,callback)=>callback(wc===ui.webContents&&permission==='media'&&store.data.settings.audioReactive));
  localSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    if(!store.data.settings.audioReactive||!request.securityOrigin.startsWith(service.origin)){callback({});return;}
    try{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1,height:1}});callback({video:sources[0],audio:'loopback'});}catch{callback({});}
  });
  ipcMain.handle('window-action',(event,command,value)=>{if(event.sender!==ui.webContents)throw new Error('Untrusted sender');return windowAction(command,value);});
  ipcMain.on('engine-ad-suppressed',event=>{if(event.sender!==engine.webContents||!adProtection)return;adProtection.state.suppressedSegments=(adProtection.state.suppressedSegments||0)+1;});
  ipcMain.on('engine-ended',(event,payload)=>{if(event.sender!==engine.webContents||state.ad||payload?.id!==state.track?.id||lastEndedSequence===playSequence)return;lastEndedSequence=playSequence;navigateQueue(false,true).catch(log);});
  ui.setVisible(true);
  await ui.webContents.loadURL(service.origin);win.show();applySettings();
  win.on('resize',layout);win.on('close',()=>log('Window close requested'));win.on('closed',()=>{log('Window closed');quitting=true;engine.webContents.close();ui.webContents.close();service.close();app.quit();});
  ui.webContents.on('render-process-gone',(_e,details)=>log('UI process gone',JSON.stringify(details)));engine.webContents.on('render-process-gone',(_e,details)=>log('YouTube process gone',JSON.stringify(details)));
  win.on('enter-full-screen',()=>emit('fullscreen',true));win.on('leave-full-screen',()=>emit('fullscreen',false));
  tray=new Tray(nativeImage.createFromPath(icon));tray.setToolTip('Afterglow');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Show Afterglow',click:()=>{win.setSkipTaskbar(false);win.show();win.focus();}}, {label:'Play / pause',click:()=>controller.action('toggle')},{label:'Next track',click:()=>navigateQueue()}, {type:'separator'}, {label:'Open YouTube Music',click:()=>showSource(true)}, {label:'Quit',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',()=>{win.show();win.focus();});
  for(const [key,action] of [['MediaPlayPause','toggle'],['MediaNextTrack','next'],['MediaPreviousTrack','previous']])globalShortcut.register(key,()=>controller.action(action).catch(log));
  globalShortcut.register('CommandOrControl+Shift+Space',()=>{win.setSkipTaskbar(false);win.show();win.focus();});
  setInterval(poll,700).unref();
  log('Ready',service.origin);
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(start).catch(error=>{log(error);dialog.showErrorBox('Afterglow could not start',error.message);app.quit();});
  app.on('before-quit',()=>{log('Before quit');quitting=true;globalShortcut.unregisterAll();service?.close();});
  app.on('will-quit',()=>log('Will quit'));
  app.on('window-all-closed',()=>app.quit());
}
