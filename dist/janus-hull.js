// Body coordinates shared by the analytic and Canvas renderers. Bow is +Z.
export const JANUS_RADIUS=.80;
export const JANUS_SEAT_X=.208;
export const JANUS_EYE=[-JANUS_SEAT_X,.216,.018];
export const JANUS_DASH={center:[0,.047,.447],half:[.435,.10,.038],sin:.46,cos:Math.sqrt(1-.46**2)};
export const JANUS_WINDOW={y:.195,halfWidth:.526,halfHeight:.207,corner:.085};
export const JANUS_PORT={across:.275,height:.475,outer:.020,inner:.012};
JANUS_PORT.axial=Math.sqrt(JANUS_RADIUS**2-JANUS_PORT.across**2-JANUS_PORT.height**2);
export const JANUS_SEAT_PARTS=[
 // Positions relative to each seat's centerline. Upholstery, a structural
 // pedestal, a separate headrest and armrests remain visible from either side.
 {kind:'box',center:[0,-.312,-.052],half:[.087,.094,.081],material:'janusFrame'},
 {kind:'oval',center:[0,-.170,-.052],half:[.145,.067,.147],material:'janusSeat'},
 {kind:'oval',center:[0,.010,-.176],half:[.142,.19,.070],material:'janusSeat'},
 {kind:'oval',center:[0,.211,-.185],half:[.106,.057,.047],material:'janusHead'},
 ...[-1,1].map(s=>({kind:'box',center:[s*.146,-.066,-.045],half:[.021,.024,.096],material:'janusArm'}))
];
export const JANUS_COLORS={janusSeat:'#33636b',janusHead:'#8faaa9',janusArm:'#42565a',janusFrame:'#4f5c60',janusHarness:'#283738',janusWall:'#abaea7',janusDark:'#2c383c',janusFloor:'#454c4d',janusScreen:'#123136',janusTick:'#457a78',janusRim:'#657576',janusReadout:'#7dd4c7',janusAmber:'#e0a16c',janusLight:'#f5d9ac'};
export function janusDashPoint(x,y,z){
 const {center:c,cos,sin}=JANUS_DASH;
 return [x+c[0],c[1]+cos*y-sin*z,c[2]+sin*y+cos*z];
}
