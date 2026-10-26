const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['minimize','close','quit','fullscreen','leave-fullscreen','source','compact','interactive','display','external']);
contextBridge.exposeInMainWorld('afterglowDesktop',{
  window:(command,value)=>{if(!allowed.has(command))return Promise.reject(new Error('Unknown window command'));return ipcRenderer.invoke('window-action',command,value);}
});
