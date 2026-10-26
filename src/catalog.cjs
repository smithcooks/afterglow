const { parseLrc } = require('./model.cjs');
const text = v => v == null ? '' : typeof v === 'string' ? v : v.text || v.toString?.() || '';
const timeout = (promise, ms=24000) => { let timer; return Promise.race([promise,new Promise((_,reject) => { timer=setTimeout(()=>reject(new Error('The music service took too long to respond. Try again.')),ms); })]).finally(()=>clearTimeout(timer)); };
function collectTracks(root, limit=40) {
  const found = new Map(); const seen = new WeakSet(); const stack = [root]; let visited = 0;
  while (stack.length && visited++ < 14000) {
    const node = stack.shift(); if (!node || typeof node !== 'object' || seen.has(node)) continue; seen.add(node);
    const id = node.video_id || node.id || node.endpoint?.payload?.videoId;
    const title = text(node.title || node.name);
    if (/^[\w-]{11}$/.test(id || '') && title && !found.has(id)) {
      const authors = node.artists || node.authors || (node.author ? [node.author] : []);
      const artist = authors.map(a=>text(a.name||a)).filter(Boolean).join(', ') || text(node.subtitle)?.split('•')[0]?.trim() || '';
      let thumbs = node.thumbnails || node.thumbnail || [];
      if (!Array.isArray(thumbs)) thumbs = thumbs.contents || [];
      const image = (thumbs.at(-1)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`).replace(/=w\d+-h\d+[^/]*$/, '=w800-h800-l90-rj');
      const d = node.duration?.seconds || node.duration?.text || node.duration || node.length_text || 0;
      const duration = typeof d === 'number' ? d : String(d).split(':').reduce((a,b)=>a*60+Number(b),0) || 0;
      found.set(id,{id,title,artist:artist || 'YouTube Music',album:text(node.album?.name),duration,image,kind:'youtube'});
      if (found.size >= limit) break;
    }
    for (const [key,value] of Object.entries(node)) {
      if (['_memo','memo','endpoint','navigation_endpoint','raw','continuation','framework_updates','actions'].includes(key)) continue;
      if (Array.isArray(value)) stack.push(...value); else if (value && typeof value === 'object') stack.push(value);
    }
  }
  return [...found.values()];
}
class Catalog {
  constructor() { this.pending=null; this.cache=new Map(); this.lyricsCache=new Map(); }
  async client() {
    if (!this.pending) this.pending = import('youtubei.js').then(({Innertube})=>Innertube.create({retrieve_player:false,generate_session_locally:true})).catch(e=>{this.pending=null;throw e;});
    return timeout(this.pending);
  }
  async search(query,kind='song') {
    query = String(query || '').trim().slice(0,250); if (!query) return [];
    kind=kind==='video'?'video':'song';const cacheKey=kind+':'+query.toLowerCase();
    const cached = this.cache.get(cacheKey); if(cached && Date.now()-cached.time < 600000) return cached.tracks;
    const yt = await this.client(); let tracks=[];
    try { tracks=collectTracks(await timeout(yt.music.search(query,{type:kind}))); } catch(error) { console.warn('Music search:',error.message); }
    if (!tracks.length) tracks=collectTracks(await timeout(yt.search(query,{type:'video'})));
    if (!tracks.length) throw new Error('No tracks found. Try a song title and artist.');
    this.cache.set(cacheKey,{time:Date.now(),tracks}); return tracks;
  }
  async discover() {
    if(this.discovery && Date.now()-this.discovery.time<3600000)return this.discovery.value;
    if(this.discoveryPending)return this.discoveryPending;
    this.discoveryPending=(async()=>{
      const names=['Juice WRLD','The Weeknd','Frank Ocean','Travis Scott','Billie Eilish','SZA','Kendrick Lamar'];
      const groups=await Promise.allSettled(names.map(name=>this.search(name)));
      const tracks=[],artists=[];groups.forEach((result,i)=>{if(result.status!=='fulfilled')return;const chosen=result.value.filter(t=>t.artist.toLowerCase().includes(names[i].toLowerCase()));const list=chosen.length?chosen:result.value;tracks.push(...list.slice(0,2));artists.push({name:names[i],image:list[0]?.image||''});});
      if(!tracks.length)throw new Error('Could not connect to YouTube Music. Check your connection and try again.');
      const value={tracks,artists};this.discovery={time:Date.now(),value};return value;
    })().finally(()=>{this.discoveryPending=null;});return this.discoveryPending;
  }
  async lyrics(track) {
    const key = `${track.artist}|${track.title}|${Math.round(track.duration||0)}`;
    if (this.lyricsCache.has(key)) return this.lyricsCache.get(key);
    const artist = String(track.artist || '').replace(/\s*-\s*Topic$/i,'').trim();
    const title = String(track.title || '').replace(/\s*[\[(](official[^\])]*|lyrics?|audio|visualizer|music video)[\])]/ig,'').replace(new RegExp('^'+artist.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[-–]\\s*','i'),'').trim();
    const params = new URLSearchParams({artist_name:artist,track_name:title});
    if (track.duration > 0) params.set('duration',String(Math.round(track.duration)));
    let match;
    try { const res = await fetch(`https://lrclib.net/api/get?${params}`,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Afterglow/0.1.0 (desktop music player)'}}); if(res.ok) match=await res.json(); } catch {}
    if (!match?.syncedLyrics) {
      try { const res=await fetch(`https://lrclib.net/api/search?${new URLSearchParams({track_name:title,artist_name:artist})}`,{signal:AbortSignal.timeout(12000)}); if(res.ok) { const items=await res.json(); match=items.filter(i=>i.syncedLyrics).sort((a,b)=>Math.abs(a.duration-(track.duration||a.duration))-Math.abs(b.duration-(track.duration||b.duration)))[0] || match; } } catch {}
    }
    const result={lines:parseLrc(match?.syncedLyrics),plain:match?.plainLyrics||'',instrumental:!!match?.instrumental,source:'LRCLIB'};
    this.lyricsCache.set(key,result); return result;
  }
}
module.exports={Catalog,collectTracks,timeout};
