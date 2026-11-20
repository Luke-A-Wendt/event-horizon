// Mask the authored rewind only. These are seconds on the current orbital
// arc's playback clock; pausing or taking over cannot leave a CSS timer running.
export function studyReplayOpacity(r){
 if(r?.sceneId!=='nasa-shuttle')return 0;
 const q=Object.values(r.flightSequences||{}).find(q=>q.active&&q.restartOnLoop&&q.loop);
 const w=q?.orbitWait;
 if(!w?.replayAfterLap&&!w?.replayOpening)return 0;
 const distance=w.replayAfterLap?w.wallSeconds-w.elapsed:w.elapsed;
 // One second of eased darkness on either side of a 0.4-second blackout.
 const u=Math.max(0,Math.min(1,1.2-distance));
 return u*u*(3-2*u);
}
export function displayStudyReplay(layer,opacity=0){
 if(!layer)return;
 if(!(opacity>0)){if(!layer.hidden)layer.hidden=true;return;}
 layer.hidden=false;layer.style.opacity=String(opacity);
}
