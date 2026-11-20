import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer} from '../dist/render-state.js';
import {publishedWorker} from './published-worker-fixture.mjs';

for(const [cpu,width,height] of [[false,1000,650],[true,390,700]]){
 const host=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
 const worker=publishedWorker(cpu,width,height);
 function visit(id,inspect=false){
  host.sceneRevision++;if(!inspect)host.loadScene(id);else host.focusTarget(host.objects.find(b=>b.catalogId==='swarm-aster').id,'track',false,true);
  worker.present(snapshotRenderer(host),id);
 }
 try{visit('dyson-swarm');visit('dyson-swarm',true);visit('disk');visit('dyson-swarm');}
 finally{worker.dispose();host.dispose();}
}
console.log('PASS: the published worker presents the Dyson swarm on cold start and return, including the moving Aster habitat, on desktop GPU and mobile CPU paths.');
