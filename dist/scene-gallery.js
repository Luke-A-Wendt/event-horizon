// Lead with the authored showcases, mix the rest once per visit, and leave
// The tide near the end. Category tabs retain their own authored order.
export function sceneGalleryOrder(presets,random=Math.random){
 const available=new Set(presets.map(p=>p.id));
 const shuffle=ids=>{const values=ids.filter(id=>available.has(id));for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
 const opening=['disk','warp-lab','warp-orbit','warp-excursion','enterprise-warp-orbit','enterprise-warp-excursion','warp-cruise','gravity-anomaly','bridge','solar-system','enterprise-solar-tour','janus-solar-tour','horizon-hierarchy','radiant-descent','rainbow-disc','extreme-kerr','binary','bridge-planets','prism-disc','horizon-watch','xray-binary','orbital-expedition'].filter(id=>available.has(id));
 const routes=presets.filter(p=>p.title?.startsWith('Earth to ')).map(p=>p.id);
 const ending=[...['planet'].filter(id=>available.has(id)),...routes],featured=new Set([...opening,...ending]);
 return [...opening,...shuffle(presets.filter(p=>!featured.has(p.id)).map(p=>p.id)),...ending];
}
