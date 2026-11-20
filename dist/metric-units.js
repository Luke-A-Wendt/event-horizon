// All inputs are SI. Choose the unit from the rounded magnitude so that a
// display crossing a boundary says "1 km", not "1,000 m".
const AU=149597870700,LY=9460730472580800;
const powers='⁰¹²³⁴⁵⁶⁷⁸⁹';
const dec=[1,2,3,4].map(n=>new Intl.NumberFormat('en-US',{maximumSignificantDigits:n}));
export function metricNumber(value,digits=3){
 if(!Number.isFinite(value))return '—';
 if(value===0)return '0';
 if(Math.abs(value)>=1e6||Math.abs(value)<.001){
  const [mantissa,exponent]=value.toExponential(digits-1).split('e');
  return String(Number(mantissa)).replace('-','−')+'×10'+String(Number(exponent)).replace(/[-\d]/g,d=>d==='-'?'⁻':powers[+d]);
 }
 return dec[digits-1].format(value).replace('-','−');
}
const lengths=[[1e-9,1e-9,'nm'],[1e-6,1e-6,'µm'],[1e-3,1e-3,'mm'],[.01,.01,'cm'],[1,1,'m'],[1e3,1e3,'km'],[.01*AU,AU,'AU'],[.01*LY,LY,'ly']];
const speeds=[[1e-9,1e-9,'nm/s'],[1e-6,1e-6,'µm/s'],[1e-3,1e-3,'mm/s'],[1,1,'m/s'],[1e3,1e3,'km/s'],[1e6,1e6,'Mm/s'],[1e9,1e9,'Gm/s'],[1e12,1e12,'Tm/s']];
function quantity(value,units,digits,zeroUnit){
 if(!Number.isFinite(value)||value<0)return '—';
 if(value===0)return '0 '+zeroUnit;
 const rounded=Number(value.toPrecision(digits));
 let i=0;while(i+1<units.length&&rounded>=units[i+1][0])i++;
 const [,scale,suffix]=units[i];return metricNumber(value/scale,digits)+' '+suffix;
}
export function metricDistance(m,digits=3){return quantity(m,lengths,digits,'m');}
export function metricSpeed(v,digits=3){return quantity(v,speeds,digits,'m/s');}
