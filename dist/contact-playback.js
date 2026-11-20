// Budget screen time by the apparent angle swept past a parking circle.
// Along a tangent atan(distance from contact / radius) is the angle to the
// body's center: this stays useful on both a lunar hop and a galactic route.
const secondsPerRadian=5;
export function contactScreenSeconds(distance,radius){
 return radius>0?secondsPerRadian*Math.atan(Math.max(0,distance)/radius):0;
}
export function contactPlaybackClock(length,departureRadius,arrivalRadius,baseSeconds){
 const enter=contactScreenSeconds(length,arrivalRadius),leave=contactScreenSeconds(length,departureRadius);
 return {length,departureRadius,arrivalRadius,baseSeconds,enter,wallSeconds:baseSeconds+leave+enter};
}
// The original timeline is strictly monotone; inserting these two positive
// angle budgets never reverses it. Invert the combined display clock so pose,
// velocity, thrust and ship time still come from exactly one physical sample.
export function contactPlaybackProgress(clock,screenFraction,distanceAt){
 if(!clock||clock.wallSeconds===clock.baseSeconds||screenFraction<=0||screenFraction>=1)return screenFraction;
 const {length,departureRadius,arrivalRadius,enter,baseSeconds,wallSeconds}=clock,time=screenFraction*wallSeconds;
 let lo=0,hi=1;
 for(let i=0;i<44;i++){
  const u=(lo+hi)/2,shot=distanceAt(u),x=typeof shot==='number'?shot:shot.distanceFraction;
  // Optional directly evaluated remaining fraction: subtracting x from one
  // rounds away local motion on the last kilometres of a galactic approach.
  const remaining=shot.remainingFraction??1-x;
  const t=u*baseSeconds+contactScreenSeconds(length*x,departureRadius)+enter-contactScreenSeconds(length*remaining,arrivalRadius);
  if(time>t)lo=u;else hi=u;
 }
 return (lo+hi)/2;
}
