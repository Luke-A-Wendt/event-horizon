// Schematic only: every node is a playlist visit, including repeat visits to
// the same body at different radii. Inspections never change the flight plan.
import {formatClockDuration} from './object-clocks.js';

const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C=299792458;
const sig=new Intl.NumberFormat('en-US',{maximumSignificantDigits:3});
const num=v=>sig.format(v);
const has=v=>Number.isFinite(v)&&v>=0;
const superscript=n=>String(n).replace(/[-0-9]/g,c=>'⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
const sci=v=>{if(!has(v))return '—';if(v===0)return '0';const [m,e]=v.toExponential(2).split('e');return Number(m)+'×10'+superscript(Number(e));};
const size=v=>!has(v)?'—':v<1000?num(v)+' m':num(v/1000)+' km';
function lightDistance(m){
 if(!has(m))return '—';
 const s=m/C;
 const scale=[[31557600,'light-yr'],[86400,'light-days'],[3600,'light-hr'],[60,'light-min'],[1,'light-sec'],[.001,'light-ms'],[.000001,'light-µs']].find(([k])=>s>=k);
 return scale?num(s/scale[0])+' '+scale[1]:size(m);
}
const pair=(term,value)=>'<div><dt>'+esc(term)+'</dt><dd>'+esc(value)+'</dd></div>';
const describeLeg=(m,leg)=>{
 const title=esc(m.stops[leg.fromIndex].name)+' to '+esc(m.stops[leg.toIndex].name);
 const figures=pair('Onboard time',formatClockDuration(leg.properSeconds))+pair('Distant time',formatClockDuration(leg.coordinateSeconds))+pair('Clock difference',formatClockDuration(leg.dilationSeconds))+pair('Peak speed',has(leg.peakSpeed)?sci(leg.peakSpeed)+' m/s':'—')+(has(leg.maxWarp)?pair('Max warp',String(Number(leg.maxWarp.toPrecision(leg.maxWarp>9?5:3)))):'')+pair('Distance',lightDistance(leg.distanceMeters));
 return '<h4>'+title+'</h4>'+(leg.error?'<p>'+esc(leg.error)+'</p>':leg.localLabel?'':'<dl>'+figures+'</dl>')+(leg.description?'<p>'+esc(leg.description)+'</p>':'');
};
const describeStop=(s,n)=>{
 let fields=has(s.massKg)?pair('Body mass',sci(s.massKg)+' kg'):'';
 if(has(s.radiusMeters))fields+=pair('Body radius',size(s.radiusMeters));
 if(has(s.horizonRadiusMeters)&&s.horizonRadiusMeters>0)fields+=pair('Event horizon radius',size(s.horizonRadiusMeters));
 if(has(s.orbitRadiusMeters)&&s.kind!=='waypoint')fields+=pair('Parking orbit radius',size(s.orbitRadiusMeters));
 if(s.kind==='dock'){
  fields+=pair('Docking port',n.port==='north'?'Upper hub':'Lower hub');
  if(s.stationParent)fields+=pair('Orbiting',s.stationParent);
  if(has(s.stationOrbit))fields+=pair('Station orbit radius',size(s.stationOrbit));
 }
 if(n.extraLaps!=null&&s.kind==='orbit')fields+=pair('Full laps',String(n.extraLaps));
 return '<h4>'+esc(s.name)+'</h4>'+(fields?'<dl>'+fields+'</dl>':'')+(s.flyThrough?'<p>Fly through the throat on the way to the next stop.</p>':s.kind==='dock'?'<p>Match the station’s orbit, then approach the nonrotating hub on rim jets.</p>':s.kind==='waypoint'?'<p>Stationary waypoint · come to rest here.</p>':'');
};
// A single visit row contains the editable stop and its outbound connection.
// The closing connection belongs to the last visit only when Loop is on.
export function disclosureAttrs(id,expanded){
 return 'data-route-detail="'+id+'" aria-controls="flight-route-'+id+'" aria-expanded="'+expanded+'"';
}
function detail(id,open,label,html){
 return '<section class="flight-route-detail" id="flight-route-'+id+'" aria-label="'+esc(label)+'"'+(open===id?'':' hidden')+'>'+html+'</section>';
}
export function stopDetails(stop,node,i,open){
 return detail('s'+i,open,'Stop details',describeStop(stop,node));
}
export function transferRow(model,leg,open){
 if(!leg)return '';
 const from=model.stops[leg.fromIndex].name,to=model.stops[leg.toIndex].name,id='l'+leg.fromIndex;
 const duration=leg.localLabel||(has(leg.properSeconds)?(leg.cruiseEstimate?'≈ ':'')+formatClockDuration(leg.properSeconds)+(leg.cruiseEstimate?' cruise':' onboard'):'Estimate unavailable');
 return '<div class="flight-route-link"><button type="button" class="flight-route-leg" '+disclosureAttrs(id,open===id)+' aria-label="'+esc(from+' to '+to+': '+duration+'; transfer details')+'"><span class="flight-leg-destination">'+(leg.toIndex===0?'Return to ':'To ')+esc(to)+'</span><strong>'+esc(duration)+'</strong></button>'+detail(id,open,'Transfer details',describeLeg(model,leg))+'</div>';
}
