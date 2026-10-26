const test=require('node:test');
const assert=require('node:assert/strict');
const {swipeDirection}=require('../ui/gestures.js');
test('horizontal swipes change tracks; clicks, vertical drags and small movement do not',()=>{
  assert.equal(swipeDirection(-100,8,250),'next');
  assert.equal(swipeDirection(100,-10,250),'previous');
  for(const [x,y] of [[0,0],[20,2],[45,1],[70,90],[80,60],[NaN,0]])assert.equal(swipeDirection(x,y,250),null);
  assert.equal(swipeDirection(-55,0,190),'next');
});
