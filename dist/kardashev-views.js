// Use live object IDs so tracking remains valid after edits or a saved scene reload.
export function installEngineeringViews(container,select,track){
 let signature='',targets=[];
 function update(sceneId,bodies,focusId){
  const earth=sceneId==='kardashev-1';
  if(!earth&&sceneId!=='kardashev-2'){container.hidden=true;signature='';targets=[];return;}
  const grid=bodies.find(o=>o.catalogId===(earth?'earth-elevator-network':'k2-solar-network'));
  const local=earth?bodies.filter(o=>o.catalogId==='type-i-earth'):bodies.filter(o=>(o.type==='star'&&o.catalogId==='sun')||o.type==='planet');
  const menu=[];
  if(grid)menu.push([grid.id,earth?'Entire elevator network':'Solar system overview']);
  for(const o of local)menu.push([o.id,earth?'Earth surface terminals':o.type==='star'?'Solar collectors':(o.name||o.label)+' port']);
  container.hidden=!menu.length;
  const key=JSON.stringify(menu);
  if(key!==signature){
   signature=key;targets=menu.map(e=>String(e[0]));select.textContent='';
   for(const [id,label] of menu){const option=select.ownerDocument.createElement('option');option.value=String(id);option.textContent=label;select.append(option);}
  }
  const current=String(focusId??(!earth&&grid?grid.id:''));
  if(select.value!==current)select.value=targets.includes(current)?current:'';
 }
 select.addEventListener('change',()=>{if(!container.hidden&&targets.includes(select.value))track(select.value);});
 return {update};
}
