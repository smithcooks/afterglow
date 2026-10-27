(function(root){
  function lyricPhrases(lines,duration=0){
    const output=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];const words=String(line.text||'').trim().split(/\s+/).filter(Boolean);
      if(words.length<=4&&String(line.text||'').length<=25){output.push({...line,sourceTime:line.time});continue;}
      if(!words.length){output.push({...line,sourceTime:line.time});continue;}
      const chunks=[];let chunk=[];let length=0;
      for(const word of words){if(chunk.length&&(chunk.length>=4||length+word.length+1>23)){chunks.push(chunk);chunk=[];length=0;}chunk.push(word);length+=word.length+1;if(/[;,!?]$/.test(word)&&length>9){chunks.push(chunk);chunk=[];length=0;}}
      if(chunk.length)chunks.push(chunk);
      const end=lines[i+1]?.time||(duration>line.time?duration:line.time+5);const span=Math.max(0,end-line.time);let consumed=0;
      for(const part of chunks){output.push({time:line.time+span*consumed/words.length,text:part.join(' '),sourceTime:line.time});consumed+=part.length;}
    }
    return output;
  }
  function lyricRows(text){
    const words=String(text??'').trim().split(/\s+/).filter(Boolean);
    if(words.length<2)return words.length?[words]:[];
    const finalWord=words.pop(),rows=[];
    for(let i=0;i<words.length;i+=2)rows.push(words.slice(i,i+2));
    rows.push([finalWord]);
    return rows;
  }
  const api={lyricPhrases,lyricRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AfterglowTiming=api;
})(typeof window==='undefined'?globalThis:window);
