const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {Catalog}=require('./catalog.cjs');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.m4a':'audio/mp4','.mp4':'video/mp4','.webm':'video/webm','.lrc':'text/plain'};
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
function createServer({store,catalog=new Catalog(),controller=null,port=0}) {
  const ui=path.resolve(__dirname,'../ui'); const clients=new Set(); const artworkCache=new Map(); let origin;let closed=false;
  function json(res,value,status=200) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  function streamFile(req,res,file) {
    if(!file || !fs.existsSync(file)) {res.writeHead(404);res.end('File not found');return;}
    const size=fs.statSync(file).size; const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start=range?Number(range[1]):0; const end=range?Math.min(Number(range[2]||size-1),size-1):size-1;
    if(start>=size || end<start) {res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
    res.writeHead(range?206:200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',CSP);res.setHeader('Referrer-Policy','no-referrer');
    if(req.headers.host!==new URL(origin).host) return json(res,{error:'Invalid host'},403);
    let url;try{url=new URL(req.url,origin);}catch{return json(res,{error:'Invalid URL'},400);}
    try {
      if(req.method==='GET' && url.pathname==='/events') {res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`event: ready\ndata: {}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
      if(req.method==='GET' && url.pathname==='/api/bootstrap') return json(res,{library:store.snapshot(),state:controller?.getState()||{status:'idle',playing:false},desktop:!!controller,version:'0.1.0'});
      if(req.method==='GET' && url.pathname==='/api/search') return json(res,{tracks:await catalog.search(url.searchParams.get('q'),url.searchParams.get('kind'))});
      if(req.method==='GET' && url.pathname==='/api/discover') return json(res,await catalog.discover());
      if(req.method==='GET' && url.pathname==='/artwork') {
        let image;try{image=new URL(url.searchParams.get('url'));}catch{return json(res,{error:'Invalid image'},400);}
        const host=image.hostname;
        if(image.protocol!=='https:' || !(host==='i.ytimg.com'||host==='lh3.ggpht.com'||host.endsWith('.googleusercontent.com')))return json(res,{error:'Image host not permitted'},403);
        let cached=artworkCache.get(image.href);
        if(!cached){const upstream=await fetch(image.href,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!upstream.ok){res.writeHead(404);res.end();return;}const type=upstream.headers.get('content-type')||'';if(!type.startsWith('image/')||Number(upstream.headers.get('content-length'))>6000000)return json(res,{error:'Invalid image'},400);const bytes=Buffer.from(await upstream.arrayBuffer());if(bytes.length>6000000)return json(res,{error:'Image too large'},400);cached={type,bytes};if(artworkCache.size>=32)artworkCache.delete(artworkCache.keys().next().value);artworkCache.set(image.href,cached);}
        res.writeHead(200,{'Content-Type':cached.type,'Cache-Control':'public,max-age=86400','Content-Length':cached.bytes.length});res.end(cached.bytes);return;
      }
      if(req.method==='GET' && url.pathname==='/api/lyrics') {const track={title:url.searchParams.get('title'),artist:url.searchParams.get('artist'),duration:Number(url.searchParams.get('duration'))};return json(res,await catalog.lyrics(track));}
      if(req.method==='GET' && url.pathname==='/api/health') return json(res,{ok:true,desktop:!!controller});
      if(req.method==='POST' && url.pathname==='/api/action') {
        if(req.headers.origin!==origin || req.headers['x-afterglow-request']!=='1' || !String(req.headers['content-type']).startsWith('application/json')) return json(res,{error:'Request denied'},403);
        let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)return json(res,{error:'Request too large'},413);}
        let data;try{data=JSON.parse(body);}catch{return json(res,{error:'Invalid JSON'},400);}
        const {action,payload}=data;
        if(action==='settings'){store.settings(payload||{});controller?.applySettings();return json(res,store.snapshot());}
        if(action==='favorite') {store.favorite(payload);return json(res,store.snapshot());}
        if(action==='queue'){store.queue(payload);return json(res,store.snapshot());}
        if(action==='playlist'){store.playlist(payload);return json(res,store.snapshot());}
        if(!controller) return json(res,{error:'Open the Windows app to play music or import files.'},409);
        return json(res,{result:await controller.action(action,payload)});
      }
      if(req.method!=='GET' && req.method!=='HEAD') return json(res,{error:'Method not allowed'},405);
      if(url.pathname==='/wallpaper') return streamFile(req,res,store.wallpaperFile);
      if(url.pathname.startsWith('/local/')) {const id=url.pathname.slice(7);return streamFile(req,res,store.localFiles[id]?.path);}
      let relative=decodeURIComponent(url.pathname);if(relative==='/')relative='/index.html';
      const file=path.resolve(ui,'.'+relative);if(!file.startsWith(ui+path.sep))return json(res,{error:'Not found'},404);
      streamFile(req,res,file);
    } catch(error){console.error(error.message);if(!res.headersSent)json(res,{error:error.message||'Request failed'},500);else res.end();}
  });
  const heartbeat=setInterval(()=>{for(const client of clients)client.write(': keepalive\n\n');},20000);heartbeat.unref();
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolve({server,origin,catalog,broadcast:(name,data)=>{for(const client of clients)client.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);},close:()=>{if(closed)return;closed=true;clearInterval(heartbeat);for(const c of clients)c.end();clients.clear();server.close();}});});});
}
module.exports={createServer};
