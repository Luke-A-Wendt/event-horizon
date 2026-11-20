// Scene files keep endpoint poses in SI units, not the sampler’s derived
// solver coefficients. Its profile selects the matching trajectory on load.
import {hullType} from './objects.js';
import {makeDockingLeg,makeLegacyDockingLeg} from './docking-flight.js';
const pose=o=>({position:o.position,velocity:o.velocity,basis:o.basis,...(o.radiusMeters>0?{radiusMeters:o.radiusMeters}:{})});
export function savedDockingMission(m){
 if(!m)return null;
 const p=m.plan;
 const plan=!p?null:p.local?{local:true,...(p.localTurnSeconds?{localTurnSeconds:p.localTurnSeconds}:{}),station:{...pose(p.station),side:p.station.side},start:pose(p.start),nodes:p.nodes,spans:p.spans,relativeVelocity:p.relativeVelocity,craftRadius:p.craftRadius}:
 {...(p.profile?{profile:p.profile}:{}),...(p.playback?{playback:p.playback}:{}),legs:p.legs.map(q=>({T:q.T,a:pose(q.a),b:pose(q.b)})),craftRadius:p.craftRadius};
 return {...(m.paced?{paced:true}:{}),...(m.playlist!==undefined?{playlist:m.playlist}:{loop:m.loop,index:m.index,route:m.route}),...(m.wallElapsed!==undefined?{wallElapsed:m.wallElapsed}:{}),craftId:m.craftId,stationId:m.stationId,phase:m.phase,elapsed:m.elapsed,side:m.side,startSceneTime:m.startSceneTime,duration:m.duration,viewSeconds:m.viewSeconds,sample:m.sample,plan};
}
export function readDockingMission(m,byId,driven,v){
 if(m===null)return null;
 const {check,fields,number,vector,basis,enumeration,string}=v;
 const time=(t,path,lo=0)=>number(t,path,lo,1e20),station=s=>check(byId.get(s)?.type==='habitat','Docking needs an existing Garden Station.'),side=s=>enumeration(s,[-1,1],'docking side');
 const validatePose=(o,at,port=false)=>{fields(o,['position','velocity','basis','radiusMeters',...(port?['side']:[])],at);vector(o.position,at+'.position');vector(o.velocity,at+'.velocity');basis(o.basis,at+'.basis');if(port)side(o.side);if(port||Object.hasOwn(o,'radiusMeters'))number(o.radiusMeters,at+'.radiusMeters',1e-5,1e18);};
 fields(m,['wallElapsed','paced','playlist','craftId','stationId','side','loop','route','index','phase','elapsed','startSceneTime','duration','viewSeconds','plan','sample'],'dockingMission');
 check(hullType(byId.get(m.craftId))==='shuttle'&&driven===m.craftId,'Docking guidance must belong to the controlled Meridian.');
 if(m.paced!==undefined)check(m.paced===true,'Invalid docking presentation clock.');
 if(Object.hasOwn(m,'wallElapsed'))time(m.wallElapsed,'docking playback time');if(Object.hasOwn(m,'playlist'))check(typeof m.playlist==='boolean','Invalid playlist docking owner.');
 station(m.stationId);side(m.side);enumeration(m.phase,['approach','docked','undock','transit','orbit','acquire','depart','departOrbit'],'docking phase');
 time(m.startSceneTime,'docking epoch');time(m.duration,'phase duration',1e-6);time(m.elapsed,'elapsed docking time');time(m.viewSeconds,'docking playback interval',.001);
 if(m.wallElapsed===undefined)m.wallElapsed=m.elapsed/m.duration*m.viewSeconds;
 check(m.phase==='docked'||m.elapsed<=m.duration+1e-6,'Docking time exceeds the phase duration.');
 // A playlist-guided mission stores exactly one copy of its itinerary, in
 // navigation.flightSequences. Only older files stored a second private route.
 if(Object.hasOwn(m,'playlist')){
  check((m.loop??false)===false&&(m.index??0)===0&&Array.isArray(m.route??[])&&(m.route??[]).length===0,'A docking mission cannot have a second playlist.');
  Object.assign(m,{loop:false,route:[],index:0});
 }
 check(typeof m.loop==='boolean'&&Array.isArray(m.route)&&m.route.length<=64&&(!m.loop||m.route.length>=2),'Invalid docking route.');
 check(Number.isInteger(m.index)&&m.index>=0&&m.index<Math.max(1,m.route.length),'Invalid docking stop index.');
 for(const stop of m.route){fields(stop,['stationId','side'],'docking stop');station(stop.stationId);side(stop.side);}
 if(m.route.length)check(m.route[m.index].stationId===m.stationId&&m.route[m.index].side===m.side,'Active docking stop does not match its route.');
 const s=m.sample;fields(s,['position','velocity','basis','acceleration','properAcceleration','extension','rcs','rcsTorque','mainThrustG','docking','phase','rangeMeters','relativeSpeed','radiusMeters'],'docking sample');
 if(Object.hasOwn(s,'rcsTorque')){vector(s.rcsTorque,'docking attitude jets');check(s.rcsTorque.every(x=>Math.abs(x)<=1),'Invalid attitude jet command.');}
 for(const k of ['position','velocity','acceleration','properAcceleration','rcs'])vector(s[k],'docking '+k);basis(s.basis,'docking attitude');number(s.extension,'tube extension',0,1);check(s.rcs.every(x=>Math.abs(x)<=1),'Invalid docking jets.');string(s.phase,'docking action',64);check(typeof s.docking==='boolean','Invalid docking inhibit.');number(s.mainThrustG,'docking main thrust',0,1.00001);
 check(['transit','orbit','departOrbit'].includes(m.phase)||s.docking,'Terminal docking maneuvers require rim thrusters.');check((m.phase==='transit'&&!s.docking)||s.mainThrustG===0,'Main thrust must be off during terminal maneuvers.');
 for(const k of ['rangeMeters','relativeSpeed','radiusMeters'])number(s[k],k,0,1e25);
 let p=m.plan;if(m.phase!=='transit'){check(p===null,'Only a rendezvous can contain a transfer plan.');return m;}
 check(p&&typeof p==='object','Rendezvous requires a transfer plan.');number(p.craftRadius,'docking craft radius',1e-5,1e18);
 if(p.local===true){
  fields(p,['local','localTurnSeconds','station','start','nodes','spans','relativeVelocity','craftRadius'],'local rendezvous');
  if(p.localTurnSeconds!==undefined)time(p.localTurnSeconds,'local alignment duration',1e-6);
  validatePose(p.station,'port reference',true);validatePose(p.start,'departure');vector(p.relativeVelocity,'departure relative velocity');
  check(Array.isArray(p.nodes)&&p.nodes.length>=2&&p.nodes.length<=12&&Array.isArray(p.spans)&&p.spans.length===p.nodes.length-1,'Invalid rendezvous gates.');
  for(const point of p.nodes)vector(point,'rendezvous gate');for(const dt of p.spans)time(dt,'gate duration',1e-6);
  p={...p,duration:p.spans.reduce((a,b)=>a+b,0)};
 }else{
  fields(p,['legs','craftRadius','profile','playback'],'station transfer');if(p.profile!==undefined)enumeration(p.profile,['flip1g'],'station transfer profile');check(Array.isArray(p.legs)&&p.legs.length>=1&&p.legs.length<=3,'Invalid station transfer legs.');
  if(p.playback){check(p.profile==='flip1g','Only a powered rendezvous can carry a transfer playback clock.');const keys=['departureRadius','arrivalRadius','departureStationRadius','arrivalStationRadius'];fields(p.playback,keys,'docking presentation');for(const key of keys)number(p.playback[key],key,0,1e18);}
  const rebuild=p.profile==='flip1g'?makeDockingLeg:makeLegacyDockingLeg;
  const legs=p.legs.map(q=>{fields(q,['a','b','T'],'station transfer leg');validatePose(q.a,'transfer start');validatePose(q.b,'transfer end');time(q.T,'leg duration',1e-4);return rebuild(q.a,q.b,q.T);});
  p={...p,legs,duration:legs.reduce((n,q)=>n+q.T,0),target:legs[legs.length-1].b};
 }
 check(Math.abs(p.duration-m.duration)<=1e-8*Math.max(1,m.duration),'Rendezvous duration disagrees with its route.');return {...m,plan:p};
}
