// Build-time only: use the same collision layout and frame-specific projections
// as the live panel. In the geometry lessons the marker is part of the diagram.
import { captureAnnotationFrame,installAnnotations } from '../dist/annotations.js';
export function thumbnailLocators(r,width,height){
 const rect={left:0,top:0,width,height},scene={append(){},getBoundingClientRect:()=>rect};
 let layer;
 const previous=document.createElementNS;
 try{
  document.createElementNS=()=>layer={style:{},setAttribute(){},remove(){}};
  const ui=installAnnotations(scene,()=>r),frame=captureAnnotationFrame(r);
  ui.update(frame);
  const markup=layer.style.display==='none'?'':layer.innerHTML||'';
  ui.dispose();
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+markup+'</svg>';
 }finally{
  if(previous)document.createElementNS=previous;else delete document.createElementNS;
 }
}
