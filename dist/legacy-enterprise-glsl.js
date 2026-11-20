// Archived original Enterprise geometry. Uses the shared craft primitives,
// registry decals and materials in craft-glsl.js. Used when a classic Enterprise is explicitly placed.
export const LEGACY_ENTERPRISE_GEOMETRY = `
  // TOS studio-model silhouette. The longitudinal extent is exactly 1.84:
  // aft nacelle cap z=-.92 to the forward saucer rim z=.92.
  // Saucer diameter .83 / 1.84 matches the approximately 417 / 947 ft ratio.
  vec3 hull=vec3(.78,.80,.75);
  // A bevelled solid saucer, not a flattened ellipsoid. Its planar rim and
  // shallow conical upper/lower decks reproduce the original stepped profile.
  vec3 saucer=vec3(0,.057,.505);vec4 part;
  part=frustumHit(ro.xzy,rd.xzy,saucer.xzy,.017,.409,.415);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  part=frustumHit(ro.xzy,rd.xzy,vec3(0,.505,.097),.023,.415,.195);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  part=frustumHit(ro.xzy,rd.xzy,vec3(0,.505,.014),.026,.165,.409);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.113,.505),vec3(.198,.027,.198)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.012,.505),vec3(.167,.025,.167)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.036,.505),vec3(.064,.022,.064)),hull,17.0,s);
  // Bridge/B-C decks and the lower sensor/planetary dome.
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.142,.505),vec3(.086,.025,.084)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.169,.505),vec3(.045,.020,.046)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.054,.505),vec3(.032,.013,.032)),vec3(.95,.84,.58),20.0,s);
  // The dorsal neck joins the forward engineering hull to the underside of
  // the saucer, just aft of its center. Its upper edge stays inside the saucer
  // rim; an aft-mounted neck made the silhouette look unlike the TOS ship.
  part=wingHit(ro.yxz,rd.yxz,vec2(-.135,.005),vec2(-.105,.175),vec2(.060,.455),.022);
  selectSurface(vec4(part.yxz,part.w),hull,19.0,s);
  part=wingHit(ro.yxz,rd.yxz,vec2(-.135,.005),vec2(.060,.455),vec2(.060,.195),.022);
  selectSurface(vec4(part.yxz,part.w),hull,19.0,s);
  // Tapered secondary hull: markedly shorter and farther forward than v4.
  selectSurface(frustumHit(ro,rd,vec3(0,-.17,-.075),.325,.044,.093),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.245),vec3(.093,.093,.037)),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,-.40),vec3(.044,.044,.016)),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,-.415),vec3(.032,.032,.004)),vec3(.23,.26,.25),18.0,s);
  // Nested copper deflector rings and central antenna, all separate geometry.
  selectSurface(frustumHit(ro,rd,vec3(0,-.17,.275),.019,.081,.072),vec3(.41,.34,.24),17.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.299),vec3(.070,.070,.011)),vec3(.69,.46,.24),17.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.309),vec3(.049,.049,.006)),vec3(.56,.34,.16),17.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(0,-.17,.312),vec3(0,-.17,.353),.007),vec3(.72,.51,.30),17.0,s);
  for(int side=0;side<2;side++){
   float x=side==0?-1.0:1.0;
   // Flat structural pylons: outboard in front view, nearly vertical in side.
   vec3 pr=ro-vec3(0,0,-.275);
   part=wingHit(pr.xzy,rd.xzy,vec2(.020*x,-.135),vec2(.032*x,-.190),vec2(.300*x,.092),.039);
   selectSurface(vec4(part.xzy,part.w),hull,19.0,s);
   part=wingHit(pr.xzy,rd.xzy,vec2(.020*x,-.135),vec2(.300*x,.092),vec2(.278*x,.151),.039);
   selectSurface(vec4(part.xzy,part.w),hull,19.0,s);
   // Long cylindrical nacelles lie just above the saucer, as in the TOS model.
   selectSurface(frustumHit(ro,rd,vec3(.292*x,.132,-.425),.435,.052,.058),hull,16.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.292*x,.132,-.860),vec3(.052,.052,.060)),vec3(.27,.30,.29),18.0,s);
   selectSurface(frustumHit(ro,rd,vec3(.292*x,.132,-.007),.018,.060,.060),vec3(.40,.40,.34),17.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.292*x,.132,.012),vec3(.056,.056,.058)),vec3(1.0,.27,.055),4.0,s);
   // Raised intercooler ridges and dark side grilles on the aft nacelles.
   selectSurface(boxHit(ro,rd,vec3(.292*x,.185,-.655),vec3(.023,.008,.145)),hull,16.0,s);
   selectSurface(boxHit(ro,rd,vec3(.347*x,.133,-.625),vec3(.004,.020,.142)),vec3(.20,.23,.23),18.0,s);
  }
`;
