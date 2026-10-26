(function(root){
  'use strict';
  function swipeDirection(dx,dy,width=240){
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return null;
    const threshold=Math.max(48,Math.min(85,width*.24));
    return Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?'next':'previous'):null;
  }
  function bindSwipe(element,{onSwipe,enabled=()=>true,motion=()=>true}){
    let gesture=null,suppressUntil=0;
    const image=element.querySelector('.album-image-wrap');
    element.title='Click to play / pause · swipe left or right to change song';
    element.addEventListener('dragstart',event=>event.preventDefault());
    element.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||!enabled())return;
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0};
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove',event=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      gesture.dx=event.clientX-gesture.x;gesture.dy=event.clientY-gesture.y;
      if(Math.abs(gesture.dx)>8&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.5){
        element.classList.add('swiping');
        if(motion())image.style.transform=`translateX(${Math.max(-28,Math.min(28,gesture.dx*.16))}px)`;
      }
    });
    function finish(event,cancelled=false){
      if(!gesture||gesture.id!==event.pointerId)return;
      const g=gesture;gesture=null;
      const dx=event.clientX-g.x,dy=event.clientY-g.y;
      element.classList.remove('swiping');image.style.transform='';
      if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);
      if(cancelled)return;
      // A drag must never become a play/pause click, even below the song threshold.
      if(Math.hypot(dx,dy)>9)suppressUntil=performance.now()+400;
      const direction=swipeDirection(dx,dy,element.offsetWidth);
      if(direction&&enabled())onSwipe(direction);
    }
    element.addEventListener('pointerup',event=>finish(event));
    element.addEventListener('pointercancel',event=>finish(event,true));
    element.addEventListener('lostpointercapture',()=>{gesture=null;element.classList.remove('swiping');image.style.transform='';});
    element.addEventListener('click',event=>{if(event.detail!==0&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  }
  const api={swipeDirection,bindSwipe};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AfterglowGestures=api;
})(typeof window==='undefined'?globalThis:window);
