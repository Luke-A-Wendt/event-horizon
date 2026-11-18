// Custom shuttle/bridge configuration for navigation, optics and clock tests.
// This short local crossing is separate from the physical interstellar tour.
import {SCENE_PRESETS} from '../../dist/config.js';
const bridge=SCENE_PRESETS.find(s=>s.id==='bridge');
SCENE_PRESETS.push({...bridge,id:'test-shuttle-bridge',title:'Shuttle bridge fixture',
 autopilot:{kind:'bridge',destinations:['Earth','Proxima Centauri b']},
 patch:{...bridge.patch,bridgeSurfaces:true,bridgeWorlds:'earth-proxima',bridgeTravelerType:'shuttle',annotations:true,nebula:true,nebulaShape:'cloud',nebulaColor:'#425e83',nebulaIntensity:.12,nebulaScale:2.5,bridgeOtherColor:'#704e5d',bridgeOtherShape:'cloud',bridgeOtherIntensity:.10,bridgeOtherScale:2.8,bridgeOtherStarDensity:.9,bridgeOtherStarBrightness:.9},
 objects:[{type:'shuttle',name:'Test shuttle',parentId:'space'}]});
