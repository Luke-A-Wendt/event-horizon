// A 1-km walking radius at the nominal model size. Rates are measured in
// the local station frame; the rim's inward support is independent of orbit.
export const HABITAT_FLOOR_UNITS=.92;
export const HABITAT_FLOOR_METERS=1000;
// The pressurized hub retains the former ellipsoid's major radius. Its
// independently driven polar hatches are fitted into two planar cuts of the
// sphere. Use the actual mating plane, not the antipode, to register the ship.
export const HABITAT_HUB_RADIUS_UNITS=.165;
export const HABITAT_AIRLOCK_RADIUS_UNITS=.0305/3;
export const HABITAT_DOCK_FACE_UNITS=Math.sqrt(HABITAT_HUB_RADIUS_UNITS**2-HABITAT_AIRLOCK_RADIUS_UNITS**2);
export const HABITAT_DOCK_RING_UNITS=1.25*HABITAT_FLOOR_UNITS/HABITAT_FLOOR_METERS;
export const HABITAT_DOCK_BORE_UNITS=.9*HABITAT_FLOOR_UNITS/HABITAT_FLOOR_METERS;
export const HABITAT_HATCH_DEPTH_UNITS=.40*HABITAT_FLOOR_UNITS/HABITAT_FLOOR_METERS;
export function habitatSpin(scale=1){
 const floorRadiusMeters=HABITAT_FLOOR_METERS*scale;
 if(!Number.isFinite(floorRadiusMeters)||floorRadiusMeters<=0)return null;
 const angularSpeedRadPerSecond=Math.sqrt(9.80665/floorRadiusMeters);
 const periodSeconds=2*Math.PI/angularSpeedRadPerSecond;
 return {floorRadiusMeters,angularSpeedRadPerSecond,periodSeconds,rpm:60/periodSeconds,
  rimAccelerationMetersPerSecond2:angularSpeedRadPerSecond**2*floorRadiusMeters,rimAccelerationG:1};
}

// A rendezvous may show half a planetary orbit in seconds. Keep the wheel and
// its axial bearing on one continuous display clock; the physical hub clock,
// orbital ephemeris and 1g spin model still use all elapsed proper time.
export function habitatWheelSeconds(station,proper=station.clock?.properSeconds||0){
 const a=station.wheelPlayback;
 return a&&proper>=a.proper?a.shown+(proper-a.proper):proper;
}
export function paceHabitatWheel(station,previousProper,screenSeconds,model){
 const proper=station.clock.properSeconds,elapsed=Math.max(0,proper-previousProper);
 const shown=habitatWheelSeconds(station,previousProper);
 // At most real-time spin, and at most one turn per displayed minute for a
 // miniature station. Pause, slow motion and ordinary clock dilation still work.
 const budget=screenSeconds*Math.min(1,model.periodSeconds/60);
 station.wheelPlayback={proper,shown:shown+Math.min(elapsed,budget)};
}
