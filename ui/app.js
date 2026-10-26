'use strict';
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const motionEnabled=()=>library.settings.motion!==false&&(library.settings.respectReducedMotion===false||!matchMedia('(prefers-reduced-motion: reduce)').matches);
const art=url=>url?`/artwork?url=${encodeURIComponent(url)}`:'assets/icon.png';
const time=value=>{value=Math.max(0,Number(value)||0);return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;};
const seed={id:'FsfVmCgfU5U',title:'Righteous',artist:'Juice WRLD',album:'Legends Never Die',duration:243,image:'https://yt3.googleusercontent.com/_5p3dcM_IaUsTrqeojs_zDYllyOeDiwIBcmCFmcjiLxydblWQoCZJP_SUY5PvJScnLy84gUJzgHNY48=w800-h800-l90-rj',kind:'youtube'};
let library={settings:{},favorites:[],queue:[],recent:[],playlists:[],localTracks:[]};
let playback={track:null,playing:false,position:0,duration:0,status:'idle',video:false};
let current=seed,desktop=false,panel=null,tab='discover',results=[],homeTracks=[],homeArtists=[],query='',searchKind='song',searching=false,searchError='',selectedPlaylist=null;
let lastPlaybackAt=performance.now(),seeking=false,lyrics={lines:[],plain:'',source:'LRCLIB'},lyricIndex=-2,lyricRequest=0,searchRequest=0,searchTimer,settingsTimer,toastTimer,panelFocus;
let playlistTarget=null,contextTrack=null,lastVolume=65,wallpaperInfo={type:'image',stamp:0},audioContext,analyser,reactiveStream,localSource,reactiveSource;
let railTracks=[],railArtist='',railRequest=0;
let sourceLyrics=[];
let lyricFrame=null;
const media=$('#local-audio');let localTrackId=null;
function icons(root=document){window.lucide?.createIcons({root,attrs:{'stroke-width':1.65,'aria-hidden':'true'}});}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
async function request(url,options){const res=await fetch(url,options);let data;try{data=await res.json();}catch{throw new Error('The app service could not respond. Restart Afterglow.');}if(!res.ok)throw new Error(data.error||'Request failed');return data;}
async function action(action,payload){return request('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Afterglow-Request':'1'},body:JSON.stringify({action,payload})});}
async function run(actionName,payload){try{return await action(actionName,payload);}catch(error){toast(error.message);return null;}}
async function windowAction(command,value){if(window.afterglowDesktop)return window.afterglowDesktop.window(command,value);if(!desktop){if(command==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return;}toast('This control is available in the Windows app.');return;}return run('window',{command,value});}
function setLibrary(value){if(!value)return;library={...library,...value};applySettings();updateFavorite();renderRail();if(panel==='queue')renderQueue();if(panel==='library'&&tab!=='discover')renderLibrary();updateQueueCount();}
function rangeFill(input){const percent=(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100;input.style.setProperty('--fill',`${percent}%`);}
function applySettings(){
  const s=library.settings;const style=document.body.style;
  document.body.classList.toggle('motion-override',s.respectReducedMotion===false);
  document.body.dataset.layout=s.layout||'split';$$('[data-layout-choice]').forEach(b=>b.classList.toggle('active',b.dataset.layoutChoice===s.layout));
  $('#album-title').textContent=s.layout==='albums'?(current?.album||current?.title||'Choose a song'):(current?.title||'Choose a song');
  document.body.dataset.backdrop=s.backdrop||'cinema';style.setProperty('--brightness',(s.brightness??62)/100);style.setProperty('--blur',`${s.blur||0}px`);style.setProperty('--glow',(s.glow??65)/100);style.setProperty('--lyric-size',`${s.lyricSize||54}px`);
  document.body.classList.toggle('no-motion',s.motion===false);document.body.classList.toggle('lyrics-hidden',s.lyrics===false);document.body.classList.toggle('clock-hidden',s.clock===false);document.body.classList.toggle('desktop-mode',!!s.desktopMode);
  $('#clock-block').hidden=s.clock===false;$('#lyrics-button').setAttribute('aria-pressed',String(s.layout!=='albums'&&s.lyrics!==false));$('#pin-button').setAttribute('aria-pressed',String(!!s.alwaysOnTop));
  for(const button of $$('[data-toggle]'))button.setAttribute('aria-checked',String(!!s[button.dataset.toggle]));
  for(const input of $$('[data-setting]')){if(document.activeElement!==input)input.value=s[input.dataset.setting]??input.min;rangeFill(input);const output=$(`#${input.dataset.setting}-output`);if(output)output.textContent=input.dataset.setting==='lyricOffset'?`${Number(input.value)>0?'+':''}${Number(input.value).toFixed(1)}s`:input.dataset.setting==='blur'?`${input.value}px`:input.dataset.setting==='lyricSize'?`${input.value}px`:`${input.value}%`;}
  $$('[data-backdrop]').forEach(b=>b.classList.toggle('active',b.dataset.backdrop===s.backdrop));
  $('#volume').value=s.volume??65;rangeFill($('#volume'));media.volume=(s.volume??65)/100;
  $('#shuffle-button').setAttribute('aria-pressed',String(!!s.shuffle));
  const repeat=s.repeat||'off';$('#repeat-button').classList.toggle('active',repeat!=='off');$('#repeat-button').setAttribute('aria-label',`Repeat ${repeat}`);$('#repeat-button').title=`Repeat ${repeat}`;$('#repeat-button').innerHTML=icon(repeat==='one'?'repeat-1':'repeat');
  $('#desktop-mode').classList.toggle('active',!!s.desktopMode);$('#window-mode').classList.toggle('active',!s.desktopMode);updateClock();icons($('#repeat-button'));if(lyrics.lines.length)updateLyrics(position());syncLyricClock();
}
async function saveSettings(patch,debounce=false){library.settings={...library.settings,...patch};applySettings();if(debounce){clearTimeout(settingsTimer);settingsTimer=setTimeout(()=>action('settings',library.settings).catch(e=>toast(e.message)),220);}else{const updated=await run('settings',patch);if(updated)setLibrary(updated);}}
function updateClock(){const now=new Date();const s=library.settings;let hours=now.getHours();if(!s.clock24)hours=hours%12||12;$('#clock').textContent=`${hours}:${String(now.getMinutes()).padStart(2,'0')}`;$('#clock').dateTime=now.toISOString();$('#date').textContent=now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});}
function updateFavorite(){const favorite=library.favorites.some(t=>t.id===current?.id);$('#favorite-button').setAttribute('aria-pressed',String(favorite));$('#favorite-button').setAttribute('aria-label',favorite?'Remove from favorites':'Add to favorites');}
function imageFallback(image){image.onerror=()=>{image.onerror=null;image.src='assets/icon.png';};}
function updateArtwork(track){
  const src=art(track.image);for(const id of ['album-image','dock-image','compact-image']){const image=$('#'+id);imageFallback(image);image.src=src;}
  $('#album-image').alt=`${track.album||track.title} artwork`;
  $('#art-backdrop').style.backgroundImage=`url("${src}")`;
  document.body.style.setProperty('--current-art',`url("${src}")`);
  $$('.ghost-card').forEach((element,i)=>{const q=library.queue;const index=q.findIndex(t=>t.id===track.id);const t=q[index+(i?1:-1)];element.style.backgroundImage=t?.image?`linear-gradient(#1118,#1118),url("${art(t.image)}")`:'';});
  $('#album-image').onload=()=>{if(motionEnabled()){const image=$('#album-image');image.getAnimations().forEach(a=>a.cancel());image.animate([{opacity:.35},{opacity:1}],{duration:480,easing:'cubic-bezier(.2,.7,.2,1)'});}try{const canvas=document.createElement('canvas');canvas.width=12;canvas.height=12;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage($('#album-image'),0,0,12,12);const pixels=context.getImageData(0,0,12,12).data;let color=[0,0,0],n=0;for(let i=0;i<pixels.length;i+=4){const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(max<35||Math.min(pixels[i],pixels[i+1],pixels[i+2])>220)continue;color[0]+=pixels[i];color[1]+=pixels[i+1];color[2]+=pixels[i+2];n++;}if(n){color=color.map(v=>Math.round(v/n));document.body.style.setProperty('--glow-a',color.join(','));document.body.style.setProperty('--glow-b',[color[2],Math.round(color[1]*.7),color[0]].join(','));}}catch{}};
}
function selectTrack(track){
  if(!track)return;const changed=current?.id!==track.id||current?.image!==track.image;current={...track};
  $('#album-title').textContent=library.settings.layout==='albums'?(track.album||track.title):track.title;$('#album-artist').textContent=track.artist;$('#dock-title').textContent=track.title;$('#dock-artist').textContent=track.artist;$('#compact-title').textContent=track.title;$('#compact-artist').textContent=track.artist;
  if(changed){updateArtwork(track);loadLyrics(track);}if(changed||!railArtist)loadArtistRail(track);updateFavorite();document.title=`${track.title} · Afterglow`;
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,album:track.album,artwork:track.image?[{src:art(track.image),sizes:'800x800',type:'image/jpeg'}]:[]});}catch{}}
}
function paintPlayback(state){
  const wasPlaying=playback.playing;playback={...playback,...state};lastPlaybackAt=performance.now();if(state.track)selectTrack(state.track);
  document.body.classList.toggle('playing',!!playback.playing);document.body.classList.toggle('video-active',!!playback.video);
  if(wasPlaying!==playback.playing||!$('#play-button svg')){const glyph=playback.playing?'pause':'play';$('#play-button').innerHTML=icon(glyph);$('#compact-toggle').innerHTML=icon(glyph);$('.cover-play').innerHTML=icon(glyph);$('#play-button').setAttribute('aria-label',playback.playing?'Pause':'Play');icons($('#player-dock'));icons($('#compact-player'));icons($('.cover-play'));}
  $('#play-button').classList.toggle('loading',playback.status==='loading');
  $('#source-label').textContent=playback.ad?'Advertisement · YouTube Music':playback.status==='loading'?'Connecting to YouTube Music':current?.localId?'Local files':'YouTube Music';
  for(const id of ['seek','next-button','previous-button'])$('#'+id).disabled=!!playback.ad;
  if(playback.error){$('#connection-banner>span').textContent=playback.error;$('#connection-banner').hidden=false;}else if(playback.status==='playing')$('#connection-banner').hidden=true;
  if('mediaSession' in navigator)navigator.mediaSession.playbackState=playback.playing?'playing':'paused';
  updateProgress();updateLyrics(position());syncLyricClock();
}
function position(){return Math.min(playback.duration||current?.duration||86400,Math.max(0,(playback.position||0)+(playback.playing&&!playback.ad?(performance.now()-lastPlaybackAt)/1000:0)));}
function updateProgress(){const p=position();const duration=playback.duration||current?.duration||0;if(!seeking){$('#seek').max=duration||100;$('#seek').value=p;rangeFill($('#seek'));}$('#elapsed').textContent=time(p);$('#duration').textContent=time(duration);}
// Keep cue activation on the display clock; transport labels can update less often.
function wantsLyricFrames(){return playback.playing&&!playback.ad&&lyrics.lines.length&&!document.hidden&&library.settings.lyrics!==false&&library.settings.layout!=='albums'&&!document.body.classList.contains('compact')&&!document.body.classList.contains('source-mode');}
function drawLyricFrame(){
  lyricFrame=null;if(!wantsLyricFrames())return;
  updateLyrics(position());lyricFrame=requestAnimationFrame(drawLyricFrame);
}
function syncLyricClock(){
  if(wantsLyricFrames()){if(lyricFrame===null)lyricFrame=requestAnimationFrame(drawLyricFrame);}
  else if(lyricFrame!==null){cancelAnimationFrame(lyricFrame);lyricFrame=null;}
}
async function loadLyrics(track){
  const id=++lyricRequest;lyrics={lines:[],plain:'',source:'LRCLIB'};lyricIndex=-2;$('#lyrics-panel').classList.remove('lyric-empty');$('#lyric-stack').replaceChildren();$('#lyric-stack').hidden=true;$('#lyrics-fallback').hidden=false;$('#lyric-before').textContent='';$('#lyric-after').textContent='';$('#lyric-current').textContent=track.title;$('#lyric-credit').textContent='Finding synced lyrics…';syncLyricClock();
  try{const result=await request('/api/lyrics?'+new URLSearchParams({title:track.title,artist:track.artist,duration:track.duration||0}));if(id!==lyricRequest)return;sourceLyrics=result.lines;lyrics={...result,lines:library.settings.phraseMotion!==false?window.AfterglowTiming.lyricPhrases(sourceLyrics,track.duration):sourceLyrics};lyricIndex=lyrics.lines.length?-2:-1;updateLyrics(position());syncLyricClock();}catch{if(id===lyricRequest){$('#lyric-credit').textContent='Lyrics unavailable · load an LRC file';}}
}
function updateLyrics(p){
  if(!lyrics.lines.length){$('#lyric-stack').hidden=true;$('#lyrics-fallback').hidden=false;$('#lyric-before').textContent='';$('#lyric-after').textContent='';$('#lyrics-panel').classList.toggle('lyric-empty',lyricIndex!==-2);$('#lyric-current').textContent=lyricIndex===-2?(current?.title||'Choose a song'):lyrics.instrumental?'Instrumental':'Lyrics unavailable';if(lyricIndex!==-2)$('#lyric-credit').textContent=lyrics.plain?'Unsynced lyrics available · load an LRC file':'Load an LRC file';return;}
  const adjusted=p+(library.settings.lyricOffset||0);let index=-1;for(let i=0;i<lyrics.lines.length;i++){if(lyrics.lines[i].time<=adjusted)index=i;else break;}
  if(index===lyricIndex)return;const previous=lyricIndex;lyricIndex=index;
  const active=Math.max(0,index);const stack=$('#lyric-stack');stack.hidden=false;$('#lyrics-fallback').hidden=true;
  const incoming=document.createDocumentFragment();
  for(let i=Math.max(0,active-2);i<=Math.min(lyrics.lines.length-1,active+2);i++){
    let node=stack.querySelector(`[data-line="${i}"]`);
    if(!node){node=document.createElement('button');node.className='lyric-line';node.dataset.line=i;node.innerHTML=(lyrics.lines[i].text||'♪').split(/\s+/).map(w=>`<span class="lyric-word">${escapeHTML(w)}</span>`).join(' ');node.setAttribute('aria-label',`Seek to ${time(lyrics.lines[i].time)}`);node.onclick=()=>run('seek',Math.max(0,lyrics.lines[i].time-(library.settings.lyricOffset||0)));node.style.opacity='0';node.style.transform=`translateY(${i<active?-90:120}px) scale(.64)`;incoming.append(node);}
  }
  if(incoming.childNodes.length)stack.append(incoming);
  const currentNode=stack.querySelector(`[data-line="${active}"]`);const activeHeight=currentNode?.offsetHeight||90;
  for(const node of [...stack.children]){
    const delta=Number(node.dataset.line)-active;node.classList.toggle('active',delta===0);node.classList.toggle('passed',delta<0);node.classList.toggle('upcoming',delta>0);
    const base=library.settings.layout==='cinema'?-activeHeight/2:0;const y=base+(delta===0?0:delta<0?-(Math.min(2,-delta)*65):activeHeight+20+(delta-1)*68);
    node.style.transform=`translateY(${y}px) scale(${delta===0?1:.64})`;node.style.opacity=delta===0?'1':Math.abs(delta)===1?(delta<0?'.18':'.34'):'0';node.style.filter=delta===0?'blur(0)':'blur(1.1px)';node.style.pointerEvents=Math.abs(delta)<2?'auto':'none';
    if(Math.abs(delta)>2)setTimeout(()=>{if(Math.abs(Number(node.dataset.line)-Math.max(0,lyricIndex))>2)node.remove();},850);
    if(Math.abs(index-previous)>2||library.settings.motion===false)node.getAnimations().forEach(a=>a.finish());
  }
  if(library.settings.phraseMotion!==false&&motionEnabled())currentNode?.querySelectorAll('.lyric-word').forEach((word,i)=>{word.getAnimations().forEach(a=>a.cancel());word.animate([{opacity:0,transform:'translateY(7px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:430,delay:i*45,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});});
  $('#lyric-credit').textContent=`${lyrics.source||'LRCLIB'} · synced lyrics`;
}
async function loadArtistRail(track){
  if(!track?.artist||railArtist===track.artist||track.localId){renderRail();return;}railArtist=track.artist;const id=++railRequest;
  try{const data=await request('/api/search?'+new URLSearchParams({q:track.artist}));if(id!==railRequest)return;railTracks=data.tracks.filter(t=>t.id!==current?.id);renderRail();}catch{renderRail();}
}
function renderRail(){const candidates=[...library.queue,...railTracks];const seen=new Set([current?.id]);const tracks=candidates.filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;}).slice(0,9);$('#rail-subtitle').textContent=library.queue.length>1?'Up next in your queue':current?.artist?`Songs by ${current.artist}`:'Your music';$('#rail-list').innerHTML=tracks.map(t=>`<button class="rail-track" data-track="${escapeHTML(t.id)}"><img src="${escapeHTML(art(t.image))}" alt=""><span>${escapeHTML(t.title)}<small>${escapeHTML(t.artist)}</small></span></button>`).join('');$$('#rail-list img').forEach(imageFallback);renderCoverFlow(tracks);}
function renderCoverFlow(tracks){
  const parent=$('.cover-flow');
  const neighbors=window.AfterglowCarousel.carouselNeighbors(window.AfterglowCarousel.carouselOrder(library.queue,current,tracks),current?.id);
  for(const button of parent.querySelectorAll('.album-neighbor'))if(!neighbors.some(n=>n.slot===Number(button.dataset.slot)))button.remove();
  for(const {slot,track} of neighbors){let button=parent.querySelector(`.album-neighbor[data-slot="${slot}"]`);if(!track){button?.remove();continue;}if(!button){button=document.createElement('button');button.className='album-neighbor';button.dataset.slot=slot;parent.append(button);}if(button.dataset.track!==track.id){button.dataset.track=track.id;button.setAttribute('aria-label',`Play ${track.title} by ${track.artist}`);button.innerHTML=`<img src="${escapeHTML(art(track.image))}" alt=""><span><strong>${escapeHTML(track.album||track.title)}</strong><small>${escapeHTML(track.artist)}</small></span>`;imageFallback(button.querySelector('img'));}}
  const source=$('#rail-source');source.querySelector('img').src=art(current?.image);source.querySelector('strong').textContent=current?.title||'Choose a song';source.querySelector('small').textContent=current?.artist||'YouTube Music';source.setAttribute('aria-label',`Play or pause ${current?.title||'music'}`);
}
async function play(track,fromQueue=false){
  if(!track)return;
  if(!desktop){toast('Use Start Afterglow.cmd to play music in the Windows app.');return;}
  if(!fromQueue){const list=tab==='favorites'?library.favorites:tab==='local'?library.localTracks:selectedPlaylist?library.playlists.find(p=>p.id===selectedPlaylist)?.tracks:results.some(t=>t.id===track.id)?results:homeTracks.some(t=>t.id===track.id)?homeTracks:railTracks;let queue=list?.some(t=>t.id===track.id)?list:[track,...library.queue.filter(t=>t.id!==track.id)];const updated=await run('queue',queue);if(updated)setLibrary(updated);}
  selectTrack(track);closePanels();paintPlayback({track,position:0,duration:track.duration,status:'loading',playing:false,error:''});
  await run('play',track);
}
async function toggle(){if(!playback.track){await play(current);return;}await run('toggle');}
function closePanels(){if(panelFocus&&document.contains(panelFocus))panelFocus.focus({preventScroll:true});for(const p of ['library','queue','settings'])$('#'+p+'-panel').hidden=true;$('#panel-scrim').hidden=true;document.body.classList.remove('panel-open');panel=null;for(const id of ['library-button','queue-button','settings-button']){$('#'+id).setAttribute('aria-expanded','false');$('#'+id).classList.remove('active');}$('#context-menu').hidden=true;}
function searchField(){return library.settings.layout==='albums'?$('#album-search-input'):$('#search-input');}
async function showPanel(name){if(panel===name){closePanels();return;}panelFocus=document.activeElement;closePanels();panel=name;$('#'+name+'-panel').hidden=false;$('#panel-scrim').hidden=false;document.body.classList.add('panel-open');$('#'+name+'-button').setAttribute('aria-expanded','true');$('#'+name+'-button').classList.add('active');if(name==='library'){renderLibrary();searchField().focus();if(!homeTracks.length&&!query)loadHome();}if(name==='queue')renderQueue();if(name==='settings'){applySettings();if(desktop){const response=await run('displays');if(response?.result)$('#display-select').innerHTML=response.result.map(d=>`<option value="${d.id}">${escapeHTML(d.label)}${d.primary?' · primary':''}</option>`).join('');}}}
async function loadHome(){
  searching=true;searchError='';renderLibrary();
  try{const data=await request('/api/discover');homeTracks=data.tracks;homeArtists=data.artists;searching=false;if(!query)renderLibrary();}catch(error){searching=false;searchError=error.message;renderLibrary();}
}
async function search(value){
  query=value.trim();selectedPlaylist=null;tab='discover';$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#clear-search').hidden=!query;$('#album-clear-search').hidden=!query;for(const input of [$('#search-input'),$('#album-search-input')])if(document.activeElement!==input)input.value=value;
  const id=++searchRequest;searchError='';
  if(!query){results=[];searching=false;renderLibrary();if(!homeTracks.length)loadHome();return;}
  let videoId='';try{const u=new URL(query);if(['www.youtube.com','youtube.com','music.youtube.com','youtu.be'].includes(u.hostname))videoId=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||'';}catch{}
  if(/^[\w-]{11}$/.test(videoId)){searching=false;results=[{id:videoId,title:'YouTube video',artist:'YouTube',duration:0,image:`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}];renderLibrary();return;}
  searching=true;renderLibrary();
  try{const data=await request('/api/search?'+new URLSearchParams({q:query,kind:searchKind}));if(id!==searchRequest)return;results=data.tracks;searching=false;renderLibrary();}catch(error){if(id!==searchRequest)return;searching=false;searchError=error.message;renderLibrary();}
}
function empty(title,description,glyph='music-2',button=''){return `<div class="empty-state">${icon(glyph)}<h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${button}</div>`;}
function rows(tracks,queue=false){return `<div class="track-list">${tracks.map((track,index)=>`<div class="track-row ${playback.track?.id===track.id?'current':''}" data-track="${escapeHTML(track.id)}" role="button" tabindex="0" aria-label="Play ${escapeHTML(track.title)} by ${escapeHTML(track.artist)}"><span class="track-index">${playback.track?.id===track.id&&playback.playing?'<span class="now-playing-bars"><i></i><i></i><i></i></span>':index+1}</span><img src="${escapeHTML(art(track.image))}" alt="" loading="lazy"><div class="track-details"><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.artist)}${track.album?' · '+escapeHTML(track.album):''}</small></div><time>${track.duration?time(track.duration):''}</time><div class="row-actions">${queue?`<button class="icon-button" data-queue-up="${index}" aria-label="Move ${escapeHTML(track.title)} up" ${index===0?'disabled':''}>${icon('chevron-up')}</button><button class="icon-button" data-queue-remove="${index}" aria-label="Remove ${escapeHTML(track.title)} from queue">${icon('x')}</button>`:`<button class="icon-button" data-add-queue="${escapeHTML(track.id)}" title="Add to queue" aria-label="Add ${escapeHTML(track.title)} to queue">${icon('list-plus')}</button><button class="icon-button" data-more-track="${escapeHTML(track.id)}" title="More" aria-label="More options for ${escapeHTML(track.title)}">${icon('ellipsis')}</button>`}</div></div>`).join('')}</div>`;}
function trackGrid(tracks){return `<div class="track-grid">${tracks.map(track=>`<button class="track-card" data-track="${escapeHTML(track.id)}" aria-label="Play ${escapeHTML(track.title)} by ${escapeHTML(track.artist)}"><div class="track-art"><img src="${escapeHTML(art(track.image))}" alt="" loading="lazy"><span class="track-start">${icon('play')}</span></div><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.artist)}</small></button>`).join('')}</div>`;}
function renderLibrary(){
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));let html='';
  if(tab==='discover'){
    if(searching)html='<div class="content-heading"><h3>Finding your music…</h3></div><div class="skeleton-grid">'+Array(10).fill('<div class="skeleton"></div>').join('')+'</div>';
    else if(searchError)html=empty('Couldn’t load music',searchError,'wifi-off','<button class="outline-button" id="retry-search">Try again</button>');
    else if(query)html=`<div class="content-heading"><h3>Top results</h3><div class="search-kinds"><button data-search-kind="song" class="${searchKind==='song'?'active':''}">Songs</button><button data-search-kind="video" class="${searchKind==='video'?'active':''}">Videos</button><span>${results.length} results</span></div></div>${library.settings.layout==='albums'?trackGrid(results.slice(0,5))+rows(results.slice(5)):rows(results)}`;
    else{
      if(homeArtists.length)html+=`<div class="content-heading"><h3>Artists</h3><span>A few favorites to start with</span></div><div class="artist-row">${homeArtists.slice(0,7).map(a=>`<button class="artist-card" data-artist="${escapeHTML(a.name)}"><img src="${escapeHTML(art(a.image))}" alt="" loading="lazy"><strong>${escapeHTML(a.name)}</strong><small>Artist</small></button>`).join('')}</div>`;
      if(library.recent.length)html+=`<div class="content-heading"><h3>Listen again</h3><span>Recently played</span></div>${trackGrid(library.recent.slice(0,5))}`;
      html+=`<div class="content-heading"><h3>Start listening</h3><span>From YouTube Music</span></div>${trackGrid(homeTracks.slice(0,10))}`;
    }
  }else if(tab==='favorites')html=`<div class="content-heading"><h3>Favorites</h3><span>${library.favorites.length} songs</span></div>`+(library.favorites.length?rows(library.favorites):empty('Your favorites, together','Tap the heart on a song to keep it here.','heart'));
  else if(tab==='local')html=`<div class="content-heading"><h3>Local files</h3><span>${library.localTracks.length} songs</span></div>`+(library.localTracks.length?rows(library.localTracks):empty('Bring your own music','Add audio files from your computer. They stay on your computer.','folder-open','<button class="outline-button" id="empty-import">'+icon('plus')+'Add music</button>'));
  else if(tab==='playlists'){
    const playlist=library.playlists.find(p=>p.id===selectedPlaylist);
    if(playlist)html=`<div class="content-heading"><h3><button id="back-playlists" aria-label="Back to playlists">‹</button> ${escapeHTML(playlist.name)}</h3><span>${playlist.tracks.length} songs · <button id="delete-playlist">Delete playlist</button></span></div>`+(playlist.tracks.length?rows(playlist.tracks):empty('This playlist is waiting','Use a song’s menu to add it to this playlist.','list-music'));
    else html=`<div class="content-heading"><h3>Your playlists</h3><button class="small-button" id="new-playlist">${icon('plus')}New playlist</button></div>`+(library.playlists.length?`<div class="playlist-grid">${library.playlists.map(p=>`<button class="playlist-card" data-playlist="${escapeHTML(p.id)}"><span class="playlist-art">${p.tracks.length?p.tracks.slice(0,4).map(t=>`<img src="${escapeHTML(art(t.image))}" alt="">`).join(''):icon('list-music')}</span><strong>${escapeHTML(p.name)}</strong><small>${p.tracks.length} songs</small></button>`).join('')}</div>`:empty('A place for every mood','Create a playlist and add the songs you want to hear together.','library'));
  }
  $('#library-content').innerHTML=html;$('#library-meta').textContent=query?'Live search results':tab==='favorites'?'Saved on this computer':tab==='playlists'?'Your local playlists':tab==='local'?'Files stay on your computer':'Search the music you love';icons($('#library-content'));$$('#library-content img').forEach(imageFallback);
}
function findTrack(id){return [current,...results,...homeTracks,...railTracks,...library.queue,...library.recent,...library.favorites,...library.localTracks,...library.playlists.flatMap(p=>p.tracks)].find(t=>t?.id===id);}
function updateQueueCount(){const count=library.queue.length;$('#queue-count').hidden=!count;$('#queue-count').textContent=count>99?'99+':count;$('#queue-summary').textContent=`${count} song${count===1?'':'s'}`;}
function renderQueue(){updateQueueCount();$('#queue-list').innerHTML=library.queue.length?rows(library.queue,true):empty('Nothing up next','Use + on a song to add it to your queue.','list-music','<button class="outline-button" id="queue-browse">Browse music</button>');icons($('#queue-list'));$$('#queue-list img').forEach(imageFallback);}
async function addQueue(track){const updated=await run('queue',[...library.queue,track]);if(updated){setLibrary(updated);toast('Added to queue');}}
function contextMenu(track,x,y){contextTrack=track;const favorite=library.favorites.some(t=>t.id===track.id);const playlist=library.playlists.find(p=>p.id===selectedPlaylist);$('#context-menu').innerHTML=`<button data-context="play">${icon('play')}Play now</button><button data-context="queue">${icon('list-plus')}Add to queue</button><button data-context="favorite">${icon('heart')}${favorite?'Remove from favorites':'Add to favorites'}</button><button data-context="playlist">${icon('library')}Add to playlist</button>${playlist?'<button data-context="remove-playlist">'+icon('list-minus')+'Remove from playlist</button>':''}${!track.localId?'<hr><button data-context="source">'+icon('external-link')+'Open on YouTube Music</button>':''}`;const menu=$('#context-menu');menu.style.left=Math.min(x,innerWidth-208)+'px';menu.style.top=Math.min(y,innerHeight-270)+'px';menu.hidden=false;icons(menu);}
function playlistDialog(target=null){playlistTarget=target;const dialog=$('#playlist-dialog');$('#playlist-dialog-title').textContent=target?'Add to playlist':'New playlist';$('#playlist-choices').hidden=!target;$('#playlist-name').required=!target;$('#playlist-name').hidden=!!target;$('label[for=playlist-name]').hidden=!!target;$('.dialog-actions').hidden=!!target;$('#playlist-name').value='';if(target)$('#playlist-choices').innerHTML=library.playlists.map(p=>`<button type="button" class="outline-button" data-add-playlist="${escapeHTML(p.id)}" style="margin-bottom:8px">${icon('list-music')}${escapeHTML(p.name)}</button>`).join('')+'<button type="button" class="outline-button" id="create-and-add">'+icon('plus')+'Create a new playlist</button>';icons(dialog);dialog.showModal();if(!target)$('#playlist-name').focus();}
async function importAudio(){const response=await run('import-audio');if(response?.result?.length){const boot=await request('/api/bootstrap');setLibrary(boot.library);tab='local';if(panel!=='library')await showPanel('library');else renderLibrary();toast(`Added ${response.result.length} file${response.result.length===1?'':'s'}`);}}
async function setWallpaper(info){if(!info)return;wallpaperInfo=info;const url=`/wallpaper?t=${info.stamp}`;$('#custom-image').classList.remove('visible');$('#custom-video').classList.remove('visible');$('#custom-video').pause();if(info.type==='video'){const v=$('#custom-video');v.src=url;v.classList.add('visible');if(library.settings.motion!==false)v.play().catch(()=>toast('This wallpaper video could not play. Choose MP4 or WebM.'));}else{$('#custom-image').src=url;$('#custom-image').classList.add('visible');}}
async function startReactive(){
  if(!desktop){toast('Audio-reactive lighting is available in the Windows app.');await saveSettings({audioReactive:false});return;}
  try{if(!audioContext)audioContext=new AudioContext();await audioContext.resume();reactiveStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{suppressLocalAudioPlayback:false}});reactiveStream.getVideoTracks().forEach(t=>t.stop());if(!reactiveStream.getAudioTracks().length)throw new Error('Windows did not provide system audio.');analyser=audioContext.createAnalyser();analyser.fftSize=512;reactiveSource=audioContext.createMediaStreamSource(reactiveStream);reactiveSource.connect(analyser);$('#edge-light').classList.add('reactive');toast('Lighting now follows system audio');}
  catch(error){stopReactive();await saveSettings({audioReactive:false});toast(error.message||'System audio could not be captured.');}
}
function stopReactive(){reactiveStream?.getTracks().forEach(t=>t.stop());reactiveSource?.disconnect();reactiveStream=null;reactiveSource=null;analyser=null;$('#edge-light').classList.remove('reactive');document.body.style.setProperty('--pulse',0);}
function localReport(ended=false,error=''){if(!localTrackId||playback.track?.id!==localTrackId)return;action('local-state',{position:media.currentTime,duration:Number.isFinite(media.duration)?media.duration:0,playing:!media.paused,ended,error}).catch(()=>{});}
async function startLocal(event){media.pause();localTrackId=event.track.id;media.src=event.url;media.volume=(library.settings.volume??65)/100;try{await media.play();localReport();}catch(error){localReport(false,'This file could not play: '+error.message);}}
for(const event of ['playing','pause','seeked','loadedmetadata'])media.addEventListener(event,()=>localReport());media.addEventListener('ended',()=>localReport(true));media.addEventListener('error',()=>localReport(false,'This audio format could not be played. Try MP3, WAV, FLAC, or M4A.'));
setInterval(()=>{if(localTrackId&&!media.paused)localReport();},1000);
function setupEvents(){
  const transport=$('.transport');transport.prepend($('#shuffle-button'));transport.append($('#repeat-button'));
  window.AfterglowGestures.bindSwipe($('#album-card'),{enabled:()=>!panel&&!playback.ad&&playback.status!=='loading',motion:()=>motionEnabled(),onSwipe:async direction=>{const ordered=window.AfterglowCarousel.carouselOrder(library.queue,current,railTracks);if(ordered.length<2){toast('Add another song to change tracks');return;}const index=ordered.findIndex(t=>t.id===current?.id);const target=ordered[(index+(direction==='next'?1:-1)+ordered.length)%ordered.length];const updated=await run('queue',ordered);if(updated){setLibrary(updated);await play(target,true);}}});
  $('#play-button').onclick=toggle;$('#album-card').onclick=toggle;$('#previous-button').onclick=()=>run('previous');$('#next-button').onclick=()=>run('next');$('#dock-track').onclick=closePanels;
  $('#favorite-button').onclick=async()=>{const updated=await run('favorite',current);if(updated){setLibrary(updated);toast(library.favorites.some(t=>t.id===current.id)?'Added to favorites':'Removed from favorites');}};
  $('#seek').onpointerdown=()=>seeking=true;$('#seek').oninput=()=>{$('#elapsed').textContent=time($('#seek').value);rangeFill($('#seek'));};$('#seek').onchange=async()=>{seeking=false;await run('seek',Number($('#seek').value));};window.addEventListener('pointerup',()=>{if(seeking&&!$('#seek').matches(':active'))seeking=false;});
  $('#volume').oninput=()=>saveSettings({volume:Number($('#volume').value)},true);$('#mute-button').onclick=()=>{const v=library.settings.volume||0;if(v){lastVolume=v;saveSettings({volume:0});}else saveSettings({volume:lastVolume});};
  $('#shuffle-button').onclick=()=>saveSettings({shuffle:!library.settings.shuffle});$('#repeat-button').onclick=()=>saveSettings({repeat:{off:'all',all:'one',one:'off'}[library.settings.repeat||'off']});$('#lyrics-button').onclick=()=>saveSettings({layout:library.settings.layout==='cinema'?'albums':'cinema',lyrics:true});
  $('#library-button').onclick=()=>showPanel('library');$('#browse-hint').onclick=()=>showPanel('library');$('#rail-source').onclick=toggle;$('#queue-button').onclick=()=>showPanel('queue');$('#settings-button').onclick=()=>showPanel('settings');$('#home-button').onclick=closePanels;$('#panel-scrim').onclick=closePanels;$$('[data-close-panel]').forEach(b=>b.onclick=closePanels);
  $('#album-search-input').onfocus=$('#album-search-input').onclick=()=>{if(panel!=='library')showPanel('library');};$('#scene-search').onclick=()=>showPanel('library');$$('[data-layout-choice]').forEach(button=>button.onclick=()=>{closePanels();saveSettings({layout:button.dataset.layoutChoice,lyrics:true});lyricIndex=-2;updateLyrics(position());});
  $('#source-button').onclick=()=>{closePanels();windowAction('source',true);};$('#return-button').onclick=()=>windowAction('source',false);$('#banner-source').onclick=()=>windowAction('source',true);$('#banner-close').onclick=()=>$('#connection-banner').hidden=true;
  $('#fullscreen-button').onclick=()=>windowAction('fullscreen');$('#clock-block').ondblclick=()=>windowAction('fullscreen');$('#pin-button').onclick=()=>saveSettings({alwaysOnTop:!library.settings.alwaysOnTop});$('#minimize-button').onclick=()=>windowAction('minimize');$('#close-button').onclick=()=>windowAction('close');
  $('#search-input').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search($('#search-input').value),320);};$('#search-input').onkeydown=e=>{if(e.key==='Enter'){clearTimeout(searchTimer);search($('#search-input').value);}};$('#clear-search').onclick=()=>{$('#search-input').value='';search('');$('#search-input').focus();};
  $('#album-search-input').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search($('#album-search-input').value),320);};$('#album-search-input').onkeydown=e=>{if(e.key==='Enter'){clearTimeout(searchTimer);search($('#album-search-input').value);}};$('#album-clear-search').onclick=()=>{$('#album-search-input').value='';search('');$('#album-search-input').focus();};
  $$('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;selectedPlaylist=null;query='';$('#search-input').value='';$('#clear-search').hidden=true;searchRequest++;searching=false;renderLibrary();if(tab==='discover'&&!homeTracks.length)loadHome();});
  $('#import-audio').onclick=importAudio;
  $('#clear-queue').onclick=async()=>{setLibrary(await run('queue',[]));};
  $$('[data-setting]').forEach(input=>input.oninput=()=>saveSettings({[input.dataset.setting]:Number(input.value)},true));
  $$('[data-toggle]').forEach(button=>button.onclick=async()=>{const key=button.dataset.toggle,value=!library.settings[key];await saveSettings({[key]:value});if(key==='phraseMotion'){lyrics.lines=value?window.AfterglowTiming.lyricPhrases(sourceLyrics,current?.duration||0):sourceLyrics;$('#lyric-stack').replaceChildren();lyricIndex=-2;updateLyrics(position());}if(key==='audioReactive'){if(value)startReactive();else stopReactive();}if(key==='motion'){$('#custom-video')[value?'play':'pause']?.();}});
  $$('[data-backdrop]').forEach(button=>button.onclick=()=>saveSettings({backdrop:button.dataset.backdrop}));
  $('#import-wallpaper').onclick=async()=>{const response=await run('import-wallpaper');if(response?.result){await saveSettings({backdrop:'custom'});setWallpaper(response.result);}};
  const importLyrics=async()=>{const response=await run('import-lyrics');if(response?.result){lyricRequest++;lyrics=response.result;lyricIndex=-2;updateLyrics(position());syncLyricClock();toast('Loaded local lyrics');}};$('#import-lyrics').onclick=importLyrics;$('#lyric-credit').onclick=importLyrics;
  $('#window-mode').onclick=()=>saveSettings({desktopMode:false});$('#desktop-mode').onclick=()=>{closePanels();saveSettings({desktopMode:true});toast('Desktop mode · Ctrl Shift Space restores the app');};$('#compact-mode').onclick=()=>{closePanels();windowAction('compact');};$('#expand-button').onclick=()=>windowAction('compact');$('#compact-close').onclick=()=>windowAction('close');
  $$('[data-command]').forEach(b=>b.onclick=()=>b.dataset.command==='toggle'?toggle():run(b.dataset.command));$('#display-select').onchange=()=>windowAction('display',$('#display-select').value);
  $('#close-playlist-dialog').onclick=()=>$('#playlist-dialog').close();$('#cancel-playlist-dialog').onclick=()=>$('#playlist-dialog').close();$('#playlist-form').onsubmit=async event=>{event.preventDefault();const name=$('#playlist-name').value.trim();if(!name)return;const oldIds=new Set(library.playlists.map(p=>p.id));let updated=await run('playlist',{action:'create',name});if(!updated)return;setLibrary(updated);if(playlistTarget){const created=library.playlists.find(p=>!oldIds.has(p.id));if(created){updated=await run('playlist',{action:'add',id:created.id,track:playlistTarget});setLibrary(updated);}}$('#playlist-dialog').close();toast(playlistTarget?'Added to new playlist':'Playlist created');};
  document.addEventListener('click',async event=>{
    const target=event.target.closest('button,[data-track]');
    if(!event.target.closest('#context-menu')&&!event.target.closest('[data-more-track]'))$('#context-menu').hidden=true;
    if(!target)return;
    if(target.dataset.moreTrack){event.stopPropagation();contextMenu(findTrack(target.dataset.moreTrack),event.clientX,event.clientY);return;}
    if(target.dataset.addQueue){event.stopPropagation();addQueue(findTrack(target.dataset.addQueue));return;}
    if(target.dataset.queueRemove!==undefined){const q=[...library.queue];q.splice(Number(target.dataset.queueRemove),1);setLibrary(await run('queue',q));return;}
    if(target.dataset.queueUp!==undefined){const q=[...library.queue],i=Number(target.dataset.queueUp);if(i>0){[q[i-1],q[i]]=[q[i],q[i-1]];setLibrary(await run('queue',q));}return;}
    if(target.dataset.track){if(target.classList.contains('album-neighbor')){const updated=await run('queue',window.AfterglowCarousel.carouselOrder(library.queue,current,railTracks));if(updated)setLibrary(updated);}play(findTrack(target.dataset.track),panel==='queue'||target.classList.contains('album-neighbor'));return;}
    if(target.dataset.artist){$('#search-input').value=target.dataset.artist;search(target.dataset.artist);return;}
    if(target.dataset.searchKind){searchKind=target.dataset.searchKind;search(query);return;}
    if(target.dataset.playlist){selectedPlaylist=target.dataset.playlist;renderLibrary();return;}
    if(target.dataset.addPlaylist){const updated=await run('playlist',{action:'add',id:target.dataset.addPlaylist,track:playlistTarget});setLibrary(updated);$('#playlist-dialog').close();toast('Added to playlist');return;}
    if(target.dataset.context){const track=contextTrack;$('#context-menu').hidden=true;if(!track)return;const command=target.dataset.context;if(command==='play')play(track);if(command==='queue')addQueue(track);if(command==='favorite'){setLibrary(await run('favorite',track));toast('Favorites updated');}if(command==='playlist')playlistDialog(track);if(command==='source')windowAction('external',`https://music.youtube.com/watch?v=${track.id}`);if(command==='remove-playlist')setLibrary(await run('playlist',{action:'remove',id:selectedPlaylist,track}));return;}
    if(target.id==='new-playlist')playlistDialog();if(target.id==='empty-import')importAudio();if(target.id==='queue-browse')showPanel('library');if(target.id==='retry-search'){if(query)search(query);else loadHome();}if(target.id==='back-playlists'){selectedPlaylist=null;renderLibrary();}if(target.id==='delete-playlist'){const updated=await run('playlist',{action:'delete',id:selectedPlaylist});selectedPlaylist=null;setLibrary(updated);toast('Playlist deleted');}if(target.id==='create-and-add'){const retained=playlistTarget;$('#playlist-dialog').close();playlistDialog();playlistTarget=retained;}
  });
  document.addEventListener('contextmenu',event=>{const row=event.target.closest('[data-track]');if(row){event.preventDefault();contextMenu(findTrack(row.dataset.track),event.clientX,event.clientY);}});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if($('#playlist-dialog').open)return;if(!$('#context-menu').hidden){$('#context-menu').hidden=true;return;}if(panel){closePanels();return;}if(document.body.classList.contains('source-mode'))windowAction('source',false);else if(document.fullscreenElement)document.exitFullscreen();else if(desktop)windowAction('leave-fullscreen');return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(panel!=='library')showPanel('library');else searchField().focus();return;}
    if(event.target.matches('input,textarea,select')||$('#playlist-dialog').open)return;
    if(event.target.closest('[data-track]')&&event.key==='Enter'){event.preventDefault();event.target.click();return;}
    if(event.code==='Space'){event.preventDefault();toggle();}else if(event.key.toLowerCase()==='f')windowAction('fullscreen');else if(event.key.toLowerCase()==='l')saveSettings({lyrics:library.settings.lyrics===false});else if(event.ctrlKey&&event.key==='ArrowRight'){event.preventDefault();run('next');}else if(event.ctrlKey&&event.key==='ArrowLeft'){event.preventDefault();run('previous',{fromSwipe:true});}else if(event.key==='ArrowRight')run('seek',position()+5);else if(event.key==='ArrowLeft')run('seek',Math.max(0,position()-5));
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateLyrics(position());syncLyricClock();});
  let interactiveState=true;
  document.addEventListener('pointermove',event=>{if(!library.settings.desktopMode||!window.afterglowDesktop)return;const interactive=!!event.target.closest('.interactive,dialog');if(interactive!==interactiveState){interactiveState=interactive;window.afterglowDesktop.window('interactive',interactive);}});
  if('mediaSession' in navigator){for(const [name,fn] of Object.entries({play:()=>run('resume'),pause:()=>run('pause'),nexttrack:()=>run('next'),previoustrack:()=>run('previous'),seekto:event=>run('seek',event.seekTime)})){try{navigator.mediaSession.setActionHandler(name,fn);}catch{}}}
}
async function boot(){
  icons();setupEvents();
  try{const data=await request('/api/bootstrap');desktop=data.desktop;library=data.library;current=data.state.track||library.lastTrack||seed;updateArtwork(current);selectTrack(current);applySettings();paintPlayback(data.state);updateQueueCount();loadLyrics(current);
    if(library.hasWallpaper&&desktop){const response=await run('wallpaper-info');if(response?.result)await setWallpaper(response.result);}
    if(library.settings.audioReactive){library.settings.audioReactive=false;applySettings();action('settings',{audioReactive:false}).catch(()=>{});}
    const events=new EventSource('/events');events.addEventListener('playback',e=>paintPlayback(JSON.parse(e.data)));events.addEventListener('library',e=>setLibrary(JSON.parse(e.data)));events.addEventListener('settings',e=>{library.settings=JSON.parse(e.data);applySettings();});events.addEventListener('notice',e=>toast(JSON.parse(e.data).message));events.addEventListener('window-mode',e=>{const mode=JSON.parse(e.data);document.body.classList.toggle('compact',!!mode.compact);document.body.classList.toggle('source-mode',!!mode.source);if(mode.compact||mode.source)closePanels();syncLyricClock();});events.addEventListener('wallpaper',e=>setWallpaper(JSON.parse(e.data)));events.addEventListener('play-local',e=>startLocal(JSON.parse(e.data)));events.addEventListener('stop-local',()=>{localTrackId=null;media.pause();media.removeAttribute('src');media.load();});events.addEventListener('local-control',e=>{const p=JSON.parse(e.data);if(p.command==='toggle'){if(media.paused)media.play().catch(error=>toast(error.message));else media.pause();}if(p.command==='play')media.play().catch(error=>toast(error.message));if(p.command==='pause')media.pause();if(p.command==='seek')media.currentTime=Math.min(p.value,media.duration||p.value);});events.onerror=()=>{$('#source-label').textContent='Reconnecting…';};
    if(!desktop){$('#minimize-button').hidden=true;$('#close-button').hidden=true;$('#source-label').textContent='Preview · open the Windows app for playback';}
  }catch(error){toast(error.message);$('#lyric-current').textContent='Afterglow';$('#lyric-credit').textContent='Restart the app to reconnect';}
  setInterval(updateClock,1000);setInterval(()=>{if(playback.playing||seeking)updateProgress();},200);
  const bins=new Uint8Array(256);let lastDraw=0;
  setInterval(()=>{if(analyser&&library.settings.audioReactive){analyser.getByteFrequencyData(bins);let sum=0;for(let i=1;i<40;i++)sum+=bins[i];document.body.style.setProperty('--pulse',Math.min(1,sum/(39*175)));}},50);
}
boot();
