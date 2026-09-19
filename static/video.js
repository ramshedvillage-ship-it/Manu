import Hls from './vendor/hls.js';
import {streamConfig} from './stream-config.js';

// Direct provider playback only. No media proxy, spoofed headers, DRM bypass or demo fallback.
export function mountVideo(){
 const video=document.querySelector('#live-video');
 if(!video)return;
 const status=document.querySelector('#video-status'),overlay=document.querySelector('#video-overlay');
 const heading=document.querySelector('#video-message-title'),message=document.querySelector('#video-message');
 const loadButton=document.querySelector('#video-load'),stopButton=document.querySelector('#video-stop');
 const source=document.querySelector('#video-provider');
 source.textContent=streamConfig.label;
 let hls=null,timer=null,active=false,played=false,generation=0,lastFrameAt=0;
 function paint(state,title,description){
  status.dataset.state=state;
  status.textContent={idle:'Not started',loading:'Connecting',playing:'Playing',paused:'Paused',buffering:'Buffering',unavailable:'Unavailable'}[state];
  if(title)heading.textContent=title;if(description)message.textContent=description;
  overlay.hidden=!['idle','loading','unavailable'].includes(state);
  video.hidden=['idle','unavailable'].includes(state);
  loadButton.disabled=state==='loading';
  loadButton.textContent=state==='unavailable'?'Retry stream':state==='loading'?'Connecting…':'Load live stream';
  stopButton.disabled=!active;
 }
 function cleanup(){
  active=false;generation++;clearTimeout(timer);timer=null;
  if(hls){hls.destroy();hls=null;}
  video.pause();video.removeAttribute('src');video.load();played=false;
 }
 function fail(text){cleanup();paint('unavailable','Video unavailable',text+' Real result tracking is separate and continues below.');}
 function watchdog(ms=15000){clearTimeout(timer);const g=generation;timer=setTimeout(()=>{if(active&&g===generation)fail('No playable stream arrived. Provider access, CORS, regional restrictions or a network failure may prevent playback. Use the reference link or a provider-approved HLS URL.');},ms);}
 async function start(){
  cleanup();
  let url;
  try{url=new URL(streamConfig.url);if(url.protocol!=='https:')throw Error('HTTPS required');}
  catch{fail('Configure a valid provider-approved HTTPS HLS URL.');return;}
  active=true;const g=generation;video.muted=true;
  paint('loading','Connecting to the provider…','Requesting the actual stream. No recording or simulated video will be substituted.');watchdog();
  async function play(){
   if(!active||g!==generation)return;
   try{await video.play();}
   catch(error){if(!active||g!==generation)return;
    if(error.name==='NotAllowedError'){clearTimeout(timer);paint('paused');message.textContent='Use the video play control to start playback.';}
    else fail('The browser could not start this stream. Open the reference site or supply a provider-approved compatible stream.');
   }
  }
  if(Hls.isSupported()){
   hls=new Hls({enableWorker:true,lowLatencyMode:true,manifestLoadingMaxRetry:0,levelLoadingMaxRetry:0,fragLoadingMaxRetry:0});
   hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(active&&g===generation)hls.loadSource(url.href);});
   hls.on(Hls.Events.MANIFEST_PARSED,play);
   hls.on(Hls.Events.LEVEL_LOADED,(_event,data)=>{if(active&&g===generation&&data.details?.live===false)fail('The provider returned a non-live playlist. Recorded-video fallback is disabled.');});
   hls.on(Hls.Events.ERROR,(_event,data)=>{if(!active||g!==generation||!data.fatal)return;const code=data.response?.code;fail('The provider stream could not be loaded'+(code?' (HTTP '+code+')':'')+'. No access restrictions were bypassed. Try the reference site or configure a provider-approved stream URL.');});
   hls.attachMedia(video);
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
   video.src=url.href;video.load();await play();
  }else fail('This browser does not support this HLS stream. Open the reference site in a supported browser.');
 }
 video.addEventListener('playing',()=>{if(!active)return;clearTimeout(timer);played=true;lastFrameAt=performance.now();paint('playing');});
 video.addEventListener('timeupdate',()=>{if(active&&!video.paused)lastFrameAt=performance.now();});
 video.addEventListener('pause',()=>{if(active){clearTimeout(timer);paint('paused');}});
 video.addEventListener('waiting',()=>{if(active&&played){paint('buffering');watchdog(12000);}});
 video.addEventListener('stalled',()=>{if(active&&played){paint('buffering');watchdog(12000);}});
 video.addEventListener('ended',()=>{if(active)fail('The provider stream ended. It will not be replayed as live video.');});
 video.addEventListener('error',()=>{if(active&&!hls)fail('The native video player could not load the provider stream.');});
 setInterval(()=>{if(active&&played&&!video.paused&&performance.now()-lastFrameAt>12000)fail('Playback stopped advancing. The last frame is not being presented as a live feed.');},3000);
 loadButton.addEventListener('click',start);
 stopButton.addEventListener('click',()=>{cleanup();paint('idle','Video stopped','Load the stream to try again. Result tracking remains independent.');});
 paint('idle','Watch the original table','Click to request the reference stream. Availability depends on the provider; no replay or demo video is used.');
}
