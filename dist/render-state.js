// Plain-data snapshots keep the UI controller independent of render-thread work.
const FIELDS=['transfer','lastTransfer','sceneRevision','driveId','freeReferenceId','freeReferencePosition','state','camera','target','cameraGuide','focusReferenceFrame','objects','time','orbitOverrides','sceneId','sceneFocusId','bridgeObjectId','bridgeTime','bridgeTravelTime','freePosition','freeTarget','freeBasis','nextObjectId','selectedId','focusId','focusMode','warpObjectId','savedOverview','warpTravelWorld','warpTravelPosition','warpTravelTime','travel'];
const copy=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
export function snapshotRenderer(renderer,{includeObjects=true}={}){
 const value={};for(const field of FIELDS)if(renderer[field]!==undefined&&(field!=='objects'||includeObjects))value[field]=renderer[field];
 value.quality=renderer.quality;return copy(value);
}
export function restoreRenderer(renderer,snapshot){
 const equalScalars=(a,b)=>a===b||!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
 // Camera-only transport retains the logical object array and its geometry
 // cache. Full files/retries still rebuild and validate configuration as usual.
 const geometryChanged=Object.hasOwn(snapshot,'objects')||snapshot.state&&!equalScalars(renderer.state,snapshot.state)||snapshot.orbitOverrides&&!equalScalars(renderer.orbitOverrides?.planet,snapshot.orbitOverrides.planet)||snapshot.orbitOverrides&&!equalScalars(renderer.orbitOverrides?.secondary,snapshot.orbitOverrides.secondary);
 const saved=copy(snapshot);for(const field of FIELDS)if(Object.hasOwn(saved,field))renderer[field]=saved[field];
 if(geometryChanged)renderer.refreshConfiguration();renderer.fillHoles();renderer.fillObjects();renderer.updateCameraFrame();
 if(snapshot.quality&&renderer.quality!==snapshot.quality)renderer.setQuality(snapshot.quality);
 renderer.didRestoreSnapshot?.();
}
export function renderSignature(renderer){
 // Slot capacity is backend-local (the UI host has no real GL limits).
 // Readiness tracks requested scene features, not hardware-specific packing.
 const {objectSlots,derivatives,derivativeExtension,...features}=renderer.shaderFeatures();return JSON.stringify([renderer.sceneRevision||0,renderer.sceneId,renderer.quality,features,renderer.state.spectrum,renderer.state.whiteHole]);
}
// Only one state message is in flight; fast gestures replace the pending state.
export class LatestStateMailbox {
 constructor(send){this.send=send;this.inflight=false;this.pending=null;this.serial=0;this.closed=false;}
 push(value){if(this.closed)return;this.pending=value;this.flush();}
 flush(){if(this.closed||this.inflight||!this.pending)return;const value=this.pending;this.pending=null;this.inflight=true;this.send({type:'state',serial:++this.serial,...value});}
 acknowledge(serial){if(serial!==this.serial)return;this.inflight=false;this.flush();}
 close(){this.closed=true;this.pending=null;this.inflight=false;}
}

// Readiness belongs to a completed frame of a specific scene revision. Browser
// suspension is excluded from the deadline; a paused simulation still renders.
export const GPU_SCENE_LOAD_TIMEOUT_MS=60000;
export const GPU_FRAME_TIMEOUT_MS=30000;
export const CPU_SCENE_TIMEOUT_MS=60000;
export const CPU_FRAME_TIMEOUT_MS=15000;
export class SceneLoadLifecycle {
 constructor({cpu=false,now=()=>performance.now()}={}){this.now=now;this.loadTimeout=cpu?CPU_SCENE_TIMEOUT_MS:GPU_SCENE_LOAD_TIMEOUT_MS;this.frameTimeout=cpu?CPU_FRAME_TIMEOUT_MS:GPU_FRAME_TIMEOUT_MS;this.revision=0;this.begin();}
 begin(){this.revision++;this.state='loading';this.timeout=this.loadTimeout;this.error='';this.elapsed=0;this.suspended=false;this.lastCheck=this.now();return this.revision;}
 check(suspended=false){const now=this.now(),gap=Math.max(0,now-this.lastCheck);this.lastCheck=now;const wasSuspended=this.suspended;this.suspended=suspended;if(this.state==='failed')return false;if(!suspended&&!wasSuspended)this.elapsed+=gap;if(this.elapsed<this.timeout)return false;this.fail(this.state==='loading'?'This scene did not finish loading. Retry, or choose another scene.':'The renderer stopped producing complete frames. Retry, or choose another scene.');return true;}
 complete(revision){if(revision!==this.revision||this.state==='failed')return false;this.state='ready';this.timeout=this.frameTimeout;this.error='';this.elapsed=0;this.lastCheck=this.now();return true;}
 fail(message){this.state='failed';this.error=String(message||'This scene could not load. Retry, or choose another scene.');}
 get stats(){return {sceneLoadState:this.state,sceneLoadRevision:this.revision,sceneLoadError:this.error};}
}
