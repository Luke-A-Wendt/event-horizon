// Old browsers can run Workers without OffscreenCanvas. In that case the
// worker records projected Canvas primitives; the UI paints bounded batches
// into a back buffer and presents only a complete frame.
const METHODS=['beginPath','closePath','moveTo','lineTo','arc','ellipse','fill','stroke','fillRect','clearRect','save','restore','translate','rotate','scale','setTransform'];
const DRAW_METHODS=new Set(['fill','stroke','fillRect']);
const validNumber=value=>typeof value!=='number'||Number.isFinite(value);
const validColor=value=>typeof value==='string'&&value.length<=256&&!/NaN|Infinity/.test(value);
const assertFrame=frame=>{if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||frame.width>2048||frame.height>2048||frame.width*frame.height>1048576||!Array.isArray(frame.commands)||!frame.commands.length||frame.commands.length>20000||!Array.isArray(frame.gradients)||frame.gradients.length>2048)throw new Error('The CPU renderer produced an invalid or empty frame.');};
const PROPERTIES=['fillStyle','strokeStyle','lineWidth','globalAlpha','globalCompositeOperation','lineCap','lineJoin'];
export function createCpuTaskScheduler(){
 if(typeof MessageChannel!=='function')return {post:fn=>setTimeout(fn,0),cancel:id=>clearTimeout(id),dispose(){}};
 // MessageChannel yields to the browser without nested timer's 4 ms clamp.
 // There is still only one outstanding slice per producer/presenter.
 const channel=new MessageChannel(),pending=new Map();let serial=0;
 channel.port1.onmessage=event=>{const fn=pending.get(event.data);pending.delete(event.data);fn?.();};
 return {post(fn){const id=++serial;pending.set(id,fn);channel.port2.postMessage(id);return id;},cancel(id){pending.delete(id);},dispose(){pending.clear();channel.port1.close();channel.port2.close();}};
}
export class CpuCommandCanvas {
 constructor(){
  this.width=2;this.height=2;this.style={};this.commands=[];this.gradients=[];this.values={};this.stack=[];
  const context={createRadialGradient:(...args)=>{const gradient={id:this.gradients.length,args,stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}};this.gradients.push(gradient);return gradient;}};
  const record=command=>{if(this.commands.length>=20000)throw new Error('CPU frame exceeded its bounded command budget.');this.commands.push(command);};
  for(const method of METHODS)context[method]=(...args)=>{if(method==='save')this.stack.push({...this.values});if(method==='restore')this.values=this.stack.pop()||{};record([method,...args]);};
  for(const name of PROPERTIES)Object.defineProperty(context,name,{get:()=>this.values[name],set:value=>{if(this.values[name]===value)return;this.values[name]=value;record(['property',name,typeof value==='object'?{gradient:value.id}:value]);}});
  this.context=context;
 }
 getContext(kind){return kind==='2d'?this.context:null;}
 addEventListener(){}removeEventListener(){}setPointerCapture(){}releasePointerCapture(){}
 beginFrame(){this.commands=[];this.gradients=[];this.values={};this.stack=[];}
 takeFrame(){const frame={width:this.width,height:this.height,commands:this.commands,gradients:this.gradients.map(({args,stops})=>({args,stops}))};this.commands=[];this.gradients=[];return frame;}
}

export class CpuCommandPlayer {
 constructor(canvas,{createCanvas=()=>document.createElement('canvas'),now=()=>performance.now(),schedule,cancel}={}){
  this.canvas=canvas;this.back=createCanvas();this.context=this.back.getContext('2d',{alpha:false});this.front=canvas.getContext('2d',{alpha:false});
  if(!this.context||!this.front)throw new Error('This browser cannot start the simplified preview.');
  this.tasks=schedule?null:createCpuTaskScheduler();this.now=now;this.schedule=schedule||this.tasks.post;this.cancel=cancel||this.tasks.cancel;this.generation=0;this.waiters=[];this.disposed=false;this.busy=false;this.lastComplete=0;
 }
 present(frame,onDone=()=>{}){
  if(this.disposed){onDone({cancelled:true,costMs:0});return;}
  // Producer backpressure normally guarantees this. Keep only the newest frame
  // if a transport retry races presentation; never accumulate a render queue.
  if(this.busy){this.pending?.onDone({cancelled:true,costMs:0});this.pending={frame,onDone};return;}
  const generation=++this.generation,start=this.now();this.busy=true;this.currentCompletion=onDone;this.lastError=null;
  const context=this.context;let gradients=null,index=0,gradientIndex=0,draws=0;
  const step=()=>{
   this.timer=null;if(this.disposed||generation!==this.generation)return;
   let result;
   try{
    if(!gradients){
     assertFrame(frame);
     if(this.back.width!==frame.width)this.back.width=frame.width;if(this.back.height!==frame.height)this.back.height=frame.height;
     gradients=[];
     context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    }
    const began=this.now();let operations=0;
    while(gradientIndex<frame.gradients.length&&operations<192&&this.now()-began<4){
     const entry=frame.gradients[gradientIndex++];operations++;
     if(!entry||!Array.isArray(entry.args)||entry.args.length!==6||!entry.args.every(x=>typeof x==='number'&&Number.isFinite(x))||entry.args[2]<0||entry.args[5]<0||!Array.isArray(entry.stops)||entry.stops.length>32)throw new Error('A CPU gradient contains invalid coordinates.');
     const g=context.createRadialGradient(...entry.args);
     for(const stop of entry.stops){if(!Array.isArray(stop)||stop.length!==2||!Number.isFinite(stop[0])||stop[0]<0||stop[0]>1||!validColor(stop[1]))throw new Error('A CPU gradient contains an invalid color.');g.addColorStop(...stop);}gradients.push(g);
    }
    if(gradientIndex<frame.gradients.length){this.timer=this.schedule(step);return;}
    while(index<frame.commands.length&&operations<192&&this.now()-began<4){
     const command=frame.commands[index++];operations++;
     if(!Array.isArray(command)||!command.length||!command.every(validNumber))throw new Error('A CPU draw contains invalid coordinates.');
     const name=command[0];
     if(name==='property'){
      const property=command[1],value=command[2];if(!PROPERTIES.includes(property))throw new Error('The CPU renderer sent an unknown drawing property.');
      if(value&&typeof value==='object'){if(!Number.isInteger(value.gradient)||!gradients[value.gradient])throw new Error('The CPU renderer sent an invalid gradient.');context[property]=gradients[value.gradient];}
      else{if(typeof value==='string'&&!validColor(value))throw new Error('The CPU renderer sent an invalid style.');context[property]=value;}
     }else if(METHODS.includes(name)){context[name](...command.slice(1));if(DRAW_METHODS.has(name))draws++;}
     else throw new Error('The CPU renderer sent an unknown drawing command.');
    }
    if(index<frame.commands.length){this.timer=this.schedule(step);return;}
    if(!draws)throw new Error('The CPU renderer produced no drawable scene.');
    if(this.canvas.width!==frame.width)this.canvas.width=frame.width;if(this.canvas.height!==frame.height)this.canvas.height=frame.height;
    this.front.drawImage(this.back,0,0);this.lastComplete=this.now();result={costMs:this.lastComplete-start};
   }catch(error){this.lastError=error;this.pending?.onDone({cancelled:true,costMs:0});this.pending=null;result={error,costMs:0};}
   this.busy=false;this.currentCompletion=null;
   for(const resolve of this.waiters.splice(0))resolve();
   onDone(result);const pending=this.pending;this.pending=null;if(pending)this.present(pending.frame,pending.onDone);
  };
  // Never begin a long paint inside the incoming worker message event.
  this.timer=this.schedule(step);
 }
 cancelFrame(){if(!this.busy)return;this.generation++;this.cancel(this.timer);this.timer=null;this.busy=false;this.pending?.onDone({cancelled:true,costMs:0});this.pending=null;this.back.width=this.back.width;const done=this.currentCompletion;this.currentCompletion=null;done?.({cancelled:true,costMs:0});for(const resolve of this.waiters.splice(0))resolve();}
 async capture(){if(this.busy)await new Promise(resolve=>this.waiters.push(resolve));if(this.lastError)throw this.lastError;if(!this.lastComplete)throw new Error('Wait for the first CPU frame before saving an image.');return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed.')),'image/png'));}
 dispose(){this.cancelFrame();this.disposed=true;this.generation++;this.cancel(this.timer);this.tasks?.dispose();this.pending=null;this.busy=false;for(const resolve of this.waiters.splice(0))resolve();}
}
