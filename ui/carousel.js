(function(root){
  'use strict';
  function carouselOrder(queue,current,recommendations=[]){
    const seen=new Set(),ordered=[];
    for(const track of queue||[])if(track?.id&&!seen.has(track.id)){seen.add(track.id);ordered.push(track);}
    if(current?.id&&!seen.has(current.id)){ordered.unshift(current);seen.add(current.id);}
    for(const track of recommendations){if(ordered.length>=5)break;if(track?.id&&!seen.has(track.id)){seen.add(track.id);ordered.push(track);}}
    return ordered;
  }
  function carouselNeighbors(ordered,currentId){
    const index=ordered.findIndex(t=>t.id===currentId),used=new Set([currentId]),neighbors=[];
    if(index<0)return neighbors;
    for(const slot of [1,-1,2,-2]){const track=ordered[(index+slot+ordered.length*2)%ordered.length];if(track&&!used.has(track.id)){used.add(track.id);neighbors.push({slot,track});}}
    return neighbors;
  }
  const api={carouselOrder,carouselNeighbors};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AfterglowCarousel=api;
})(typeof window==='undefined'?globalThis:window);
