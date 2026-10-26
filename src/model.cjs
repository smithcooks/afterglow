const fs = require('node:fs');
const path = require('node:path');

const defaults = {
  backdrop: 'cinema', brightness: 62, blur: 0, glow: 65,
  clock: true, clock24: true, lyrics: true, lyricSize: 54,
  lyricOffset: 0, motion: true, respectReducedMotion: true, alwaysOnTop: false,
  volume: 65, shuffle: false, repeat: 'off', wallpaper: null,
  desktopMode: false, audioReactive: false, layout:'split', phraseMotion:true,
};
const clamp = (n, a, b) => Math.min(b, Math.max(a, Number(n) || 0));
function cleanTrack(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid track');
  const localId = typeof value.localId === 'string' && /^[a-f0-9-]{36}$/.test(value.localId) ? value.localId : '';
  const id = String(value.id || '').slice(0, 80);
  if (!localId && !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error('Invalid YouTube video');
  let image = String(value.image || '');
  try { const u = new URL(image); if (u.protocol !== 'https:') image = ''; } catch { image = ''; }
  return { id: localId || id, ...(localId ? { localId } : {}), title: String(value.title || 'Untitled').slice(0, 400),
    artist: String(value.artist || 'Unknown artist').slice(0, 300), album: String(value.album || '').slice(0, 300),
    image: image.slice(0, 3000), duration: clamp(value.duration, 0, 86400), kind: localId ? 'local' : 'youtube' };
}
function sanitizeSettings(patch, current = defaults) {
  const next = { ...current };
  for (const key of ['clock','clock24','lyrics','motion','respectReducedMotion','alwaysOnTop','shuffle','desktopMode','audioReactive','phraseMotion']) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key];
  }
  for (const key of ['brightness','glow','volume']) if (Number.isFinite(patch[key])) next[key] = clamp(patch[key], 0, 100);
  if (Number.isFinite(patch.blur)) next.blur = clamp(patch.blur, 0, 40);
  if (Number.isFinite(patch.lyricSize)) next.lyricSize = clamp(patch.lyricSize, 28, 82);
  if (Number.isFinite(patch.lyricOffset)) next.lyricOffset = clamp(patch.lyricOffset, -10, 10);
  if (['cinema','artwork','landscape','custom'].includes(patch.backdrop)) next.backdrop = patch.backdrop;
  if (['off','all','one'].includes(patch.repeat)) next.repeat = patch.repeat;
  if (['cinema','albums','split'].includes(patch.layout)) next.layout=patch.layout;
  return next;
}
class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'library.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') { try { fs.copyFileSync(this.file, this.file + '.recovery'); } catch {} } }
    const safeTracks = tracks => (Array.isArray(tracks) ? tracks : []).slice(0, 2000).flatMap(t => { try { return [cleanTrack(t)]; } catch { return []; } });
    this.data = {
      settings: sanitizeSettings(saved.settings || {}), favorites: safeTracks(saved.favorites),
      recent: safeTracks(saved.recent), queue: safeTracks(saved.queue),
      playlists: (Array.isArray(saved.playlists) ? saved.playlists : []).filter(p => p && typeof p.id === 'string').map(p => ({id:p.id.slice(0,100),name:String(p.name || 'Playlist').slice(0,80),tracks:safeTracks(p.tracks)})),
    };
    this.localFiles = saved.localFiles && typeof saved.localFiles === 'object' ? saved.localFiles : {};
    this.wallpaperFile = typeof saved.wallpaperFile === 'string' ? saved.wallpaperFile : '';
    this.lastTrack = safeTracks([saved.lastTrack])[0] || null;
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({...this.data,localFiles:this.localFiles,wallpaperFile:this.wallpaperFile,lastTrack:this.lastTrack}, null, 2));
    fs.renameSync(tmp, this.file);
  }
  snapshot() { return JSON.parse(JSON.stringify({...this.data,lastTrack:this.lastTrack,hasWallpaper:!!this.wallpaperFile,localTracks:Object.values(this.localFiles).map(v=>v.track).filter(Boolean)})); }
  settings(patch) { this.data.settings = sanitizeSettings(patch, this.data.settings); this.save(); return this.data.settings; }
  favorite(track) { track = cleanTrack(track); const i = this.data.favorites.findIndex(t => t.id === track.id); if (i >= 0) this.data.favorites.splice(i,1); else this.data.favorites.unshift(track); this.save(); return this.data.favorites; }
  remember(track) { track = cleanTrack(track); this.lastTrack = track; this.data.recent = [track,...this.data.recent.filter(t => t.id !== track.id)].slice(0,100); this.save(); }
  queue(tracks) { if (!Array.isArray(tracks) || tracks.length > 1000) throw new Error('Queue is too large'); this.data.queue = tracks.map(cleanTrack); this.save(); return this.data.queue; }
  playlist({action,id,name,track}) {
    if (action === 'create') { const p = {id:require('node:crypto').randomUUID(),name:String(name || 'New playlist').trim().slice(0,80),tracks:[]}; this.data.playlists.push(p); }
    else {
      const p = this.data.playlists.find(p => p.id === id); if (!p) throw new Error('Playlist not found');
      if (action === 'delete') this.data.playlists = this.data.playlists.filter(p => p.id !== id);
      else if (action === 'rename') p.name = String(name || p.name).trim().slice(0,80);
      else if (action === 'add') { const t = cleanTrack(track); if (!p.tracks.some(s => s.id === t.id)) p.tracks.push(t); }
      else if (action === 'remove') p.tracks = p.tracks.filter(t => t.id !== track?.id);
      else throw new Error('Unknown playlist action');
    }
    this.save(); return this.data.playlists;
  }
}
function parseLrc(text) {
  const lines = [];
  let offset = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    const o = line.match(/^\[offset:([+-]?\d+)\]/); if (o) { offset = Number(o[1]) / 1000; continue; }
    const times = [...line.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    const value = line.replace(/\[[^\]]*\]/g,'').trim();
    for (const match of times) lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + offset, text:value });
  }
  return lines.sort((a,b) => a.time-b.time);
}
function nextQueueIndex(queue, currentId, {repeat = 'off', shuffle = false} = {}, previous = false) {
  if (!queue.length) return -1;
  const i = queue.findIndex(t => t.id === currentId);
  if (shuffle && queue.length > 1) { const options = queue.map((_,n) => n).filter(n => n !== i); return options[Math.floor(Math.random()*options.length)]; }
  const next = i + (previous ? -1 : 1);
  if (next >= 0 && next < queue.length) return next;
  return repeat === 'all' ? (previous ? queue.length-1 : 0) : -1;
}
module.exports = { Store, defaults, cleanTrack, sanitizeSettings, parseLrc, nextQueueIndex };
