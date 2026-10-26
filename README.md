# Event Horizon

An interactive spacetime observatory that runs entirely on your own device. Fly around black holes, change their mass and spin, assemble scenes, place orbiting objects, inspect a white-hole model, traverse an illustrative wormhole, and explore the mathematics.

[Event Horizon](https://luke-a-wendt.github.io/event-horizon/)

<img width="3840" height="2158" alt="image" src="https://github.com/user-attachments/assets/2a2e9208-f0bb-4257-8e0f-0df1fb2f8c6b" />
<img width="1920" height="1079" alt="image" src="https://github.com/user-attachments/assets/2ce9ad45-2b71-455c-bf9f-292cea929ecf" />

## Explore

The page opens directly in **The edge of infinity**, a warm accretion-disc observatory. **Math** opens from the header, and **Scenes** opens from the viewing panel. The Scenes gallery has 44 presets, illustrated with high-resolution screenshots and grouped as Black holes, Warp drive, Wormholes, Solar systems, Spacecraft, and Geometry; Math opens the Black holes, Warp, and Wormholes notebooks. Every scene opens **paused**; press Play to begin. Geometry scenes enable labels and the coordinate grid, with shaded gray spheres for stars and planets and the usual optical appearance for black and white holes. Other scenes begin with labels off. Each group progresses from introductory views to more involved or extreme comparisons.

The interface centers on **Scenes**, **Objects**, and **Map**. Objects appear in an expandable tree rooted at **Space**. Space owns the background starfield and nebula; in a wormhole scene it owns both independent skies. Select a row or its gear to open properties and camera actions. Map is a second way to navigate that same hierarchy. The root Camera panel can also choose any available viewing target. Display keeps spectra, render quality, and time controls together. Viewport buttons control the shared **Grid** and object **Labels**. Double-click or double-tap an object or its label to track it; repeat on the tracked object to open its properties. A single tap on the rendered scene leaves the selection unchanged. Help covers Scenes, Math, and interaction controls.

In Geometry mode, the exterior black-hole contour follows the apparent lensed capture boundary (the shadow), not a directly visible event-horizon surface. The interior cutaway exposes coordinate horizon rings and the singularity proxy. The mass slider has an exponential scale and an editable maximum in solar masses.

## Object families

Black holes, stars, planets, ships, and astronauts can have children. Children inherit their parent’s motion and add their own local orbit. The placement hierarchy is black hole → star → planet → moon → spacecraft → astronaut. An equal-class pair is allowed, but equal-class triples and chains are rejected. This is a composition rule, not a universal physical mass ordering. Paired bodies use prescribed barycentric circular motion; nested systems are not a numerical many-body stability solver.

Accretion discs and jets attach to black holes or stars; protostars and compact stars can accrete and launch outflows without an event horizon. Rings and asteroid belts attach to stars or planets and offer icy, rocky, and metallic appearances. These attachments are leaf nodes and cannot have satellites. Deleting a parent through the tree removes its whole branch. Reparenting rejects cycles and incompatible hosts. The logical scene supports up to 1,024 bodies and attachments, plus two black holes. A bounded set of six, eight, or twelve relevant bodies, depending on GPU uniform capacity, is selected for detailed shading each frame; the catalog and object cameras retain the full hierarchy. Moons are a smaller class than planets, so a planet can have many moons. Same-class pair restrictions apply to user-created peers.

Stars have editable class, color, radius, mass, angular velocity, spots, and corona. Classes include main-sequence stars, red dwarfs, protostars, red giants, supergiants, white dwarfs, neutron stars, and hypothetical Thorne–Żytkow objects. Stellar angular velocity Ω is in radians per second; a* is derived from an approximate moment of inertia and is not the same control. Mass and radius show the model’s compactness threshold. Crossing it changes the same object into a compact-horizon representation without losing its identity or children. This threshold is a visualization criterion, not a universal stability calculation: real collapse depends on pressure, equation of state, rotation, mass loss, and the full spacetime. **The point of no return** cycles radius through the threshold; its expanding half is explicitly a fictional reset. Near a black hole, a procedural tidal stream responds to distance, mass, and spin: zero spin removes its angular swirl. It illustrates stripped plasma rather than solving stellar magnetohydrodynamics. Planets offer rocky, ocean, gas, and ice appearances. Named worlds additionally offer reference surface maps, distinct atmospheric features, and approximate triaxial shapes for irregular bodies. The starfield uses independent randomized layers with brightness and color-diversity controls.

Select **Track**, **Ride · 360°**, or **Free roam here** from an object's properties. NASA Shuttle and Starship Enterprise expose **Drive** in their properties, Camera, Map, and beside the viewport status. Selecting **Drive** switches the camera to **Orbit** and tracks the selected ship. The Enterprise opens directly from the side, traveling left to right. Changing warp adjusts the tracked camera distance to fit the current bubble; at warp zero it frames the ship itself, with clear margins around the controls. Orbiting preserves this framing. Manual zoom lasts until the next warp change, including braking; an off-screen pan recenters when needed to fit the field. Ride and Chase remain deliberate alternate viewpoints. The NASA Shuttle opens from behind. Warp scenes share the Enterprise side view; wormhole travelers initially use **Chase · 360°**. The flight strip lies below the rendered image, with left/right steering and a warp or forward-acceleration slider. Its controls share one compact row; speed and angular velocity appear beneath the object distance, rounded to two significant figures. The Shuttle also reports accumulated time dilation in nanoseconds in that readout. **Stop motion** slows the Enterprise and its turning; **Cut thrust** shuts off the Shuttle’s burn while it coasts. The flight camera menu offers Chase or Ride. **Resume orbit** blends back to the assigned parent-relative orbit; this is a prescribed navigation transition, not a modeled engine burn.

**Opacity** is available in the properties of stars, planets, moons, probes, and spacecraft. Translucency reveals objects behind a surface without changing its mass or physical dimensions. Geometry mode uses opaque gray bodies.

The normal 3D view uses physical reference sizes or explicitly labeled proxies for unmeasured bodies. Orbit map uses equal-size schematic symbols. Locator labels remain selectable for distant catalog bodies, with stable text placement and anchors from the displayed optical chart. GPU labels follow the approximate lens model; the CPU preview remains schematic.

The bridge is a distinct **Wormholes** scene family, not an orbitable body. Its default has a plain starfield on one side and a purple nebula on the other. The **Math → Wormholes** notebook distinguishes the nontraversable Einstein–Rosen bridge from the Ellis traversal used on screen.

### Reference systems and geometry studies

Named scenes include Sagittarius A*, TON 618, an expanded Solar System, Proxima Centauri with planet b, and Alpha Centauri A and B. The Solar System catalog includes the Sun, all eight planets, 461 planetary satellites compiled from the included JPL/NASA source snapshot, 24 selected dwarf/minor bodies, 14 additional dwarf/minor-body moons, five ring systems, and two statistical belts: 517 scene objects, including the ISS and a NASA Shuttle in illustrative Earth orbits. Pluto and all five of its moons, Ceres, and Sedna are included. This is not every asteroid, comet, or trans-Neptunian object. See [Solar System data](dist/SOLAR_SYSTEM_DATA.md) for the source snapshot and measurement limits. Reference sizes, masses, and orbital distances use published measurements where available. Tiny moons without measured radii use an explicitly labeled display proxy; unmeasured masses are not presented as observations. Starting phases, simplified orbital-plane conventions, plasma details, and unknown surfaces are illustrative. TON 618's chosen 66-billion-solar-mass estimate is uncertain. Proxima b's radius is estimated. Alpha Centauri's real binary orbit is eccentric; this study uses a circular approximation. Source links and distinctions appear in the mathematics guide.

All Geometry scenes use **Geometry** display mode against a black background, with no starfield, nebula, discs, or jets. Stars and planets appear as shaded gray spheres, with their boundaries and occlusion evaluated along the scene’s optical rays. Black and white holes use their visible-light optical rendering. The coordinate grid stays on, and labels are initially enabled. Geometry studies open from above the orbital plane, with framing adapted to the viewport and control overlays. The binary grid comparison begins with equal masses and equal spins. White hole and The last dance are included in Geometry. Studies cover Schwarzschild, Kerr, binary black holes, a slow orbital study around a horizonless 1.4-solar-mass, 100-km core, and a hypothetical black/white-hole pair. Stellar and planetary spatial grids are nearly flat at real scale. A planet follows a geodesic in spacetime, not a straight path caused by a spatial sheet moving beneath it; the live demonstration trajectories remain prescribed. In **An orbit through spacetime**, inward radial coordinate marks use the same simulation clock as the orbit. The default circuit takes 20 seconds; accelerated playback is limited to a minimum of 10 seconds per circuit. The field itself is stationary: the animation illustrates a freely falling coordinate convention, not accumulating curvature or a material flow. The guide explains the weak-field metric and compactness.

Spacetime grids use coordinate sheets. The warp display rises and falls locally as an illustrative contraction/expansion cue, returning to a planar far field. This diagnostic deformation is not a literal spatial embedding of the Alcubierre metric.

The warm accretion disc is the default view. **Looking out from the edge** starts in the astronaut's outward 360° view with an accretion disc and a plain starfield; **Falling into blue fire** starts well outside the blue ribbons in the astronaut’s inward-facing 360° view, then follows a ten-second approach that slows toward the exterior horizon limit. **An aurora of falling light** opens in free roam near the horizon looking tangentially along the teal disc. Additional spectral starting points include **Radio observatory** and **Gamma-ray engine**.

**The point of no return** uses a nonrotating, ten-solar-mass core and a continuous spherical compactness fade. For a stationary emitter observed from infinity, `g = sqrt(1 - 2 r_g/R)` and bolometric intensity scales as `g^4`. As the surface contracts, lensing means its apparent radius does not equal its physical radius: below the photon sphere, the escape-cone edge approaches the black-hole shadow radius `3 sqrt(3) r_g`, while the horizon is at `2 r_g`. The scene is a sequence of quasi-static comparison snapshots, not a collapse simulation with delayed photon arrivals. Its expanding half is a fictional reset.

Other comparisons include **The point of no return**, **An orbit through spacetime**, **Black + white holes · orbit**, **The last dance**, and **A meeting of opposites · inspiral**. **An aurora of falling light**, **Double rainbow**, and **A violet double helix** demonstrate artistic disc palettes and patterned jets. **A step between worlds**, **A shadow through the throat**, and **Between fire and ice** vary traveler, camera, and opposing skies. Compact-object traversal is an explicitly speculative optical composition: the traveler does not back-react on the wormhole. The ordinary single-throat Ellis model uses the default starfield-to-purple-nebula environment.

**Thorne–Żytkow Object** is an illustrative planetary system built around a hypothetical red-supergiant envelope containing a neutron-star core. The core belongs to the same composite star, and its mass is included in the star’s total mass. Four fictional outer worlds, a moon, rings, and a debris belt surround the single composite star. The scene opens as an illustrative translucent cutaway: a luminous, enlarged core marker shines through the red envelope. Envelope opacity is editable; 100% restores the opaque exterior. The marker is not to scale; the physical reference core retains its 12 km radius and is included once in the total mass. The stellar inspector also includes a labeled interior diagram. The scene is not a reconstruction of a confirmed astronomical system. Background: [O’Grady et al., Thorne–Żytkow Objects](https://arxiv.org/abs/2410.02896).

### Orbit map and geometric explanation

The **Map** toolbar button opens a separate top-down schematic around a selected parent. Distances can use a logarithmic or linear radial scale; equal-size body symbols keep the Sun, planets, or a planet’s moons readable together. Select a body to edit its properties, track or ride it, or center a map on its children. Double-click or double-tap a body to make it the map scope; the breadcrumb path moves back outward through its ancestors. **Explore children** also centers the map on a body’s children. The orbit-radius slider follows the map’s radial scale and updates the derived Keplerian period and speed; it changes the actual orbit, while the map’s display-scale controls do not resize the physical scene. A potential/clock-deficit inset has an explicit amplification control; it is not an exact metric embedding. The guide explains the distinction between potential depth, tidal curvature, and local free fall. Massive bodies have timelike four-velocity norm −c², not a local spatial speed of c.

A circular orbit can have constant speed while its velocity direction changes in central-body coordinates. A freely falling body has zero proper acceleration and parallel-transports its four-velocity along a spacetime geodesic. A local inertial frame makes the path straight to first order in a small neighborhood; no single flat diagram does this for the whole orbit. The mathematics guide includes the geodesic equation, weak-field metric, tidal acceleration, curvature invariant, and the map’s scale transformation.

### Save and load scenes

Open **Scenes → Save scene** to download a human-readable `.yaml` file. **Load scene** opens a saved file from your device. Objects are nested beneath their parents, alongside editable properties; the file also stores the environment, display settings, simulation clock, and viewpoint. Loading opens the saved scene paused and retains the current GPU or CPU backend.

Scene files require an exact application-version match: **1.27.0**. A different version shows **Cannot load** and leaves the current scene unchanged. The reader accepts the generated YAML structure with ordinary scalar edits and validates object relationships, with a 4 MB file limit. Formatting and validation run in a local worker; browsers without worker support can handle only small scenes and files.

### Five spectral views and Geometry

Radio and gamma radiation can reveal material around a black hole, including its energetic jets. The event horizon itself remains dark. **Radio** combines a radio-emission study with millimeter-wave emphasis at the high-frequency end of the radio spectrum. EHT observations at millimeter wavelengths motivate the compact-flow view, but these images do not reproduce a telescope's resolution, sensitivity, or data processing.

| View | Visual emphasis |
| --- | --- |
| Visible | Familiar stars, reflected surfaces, and glowing plasma |
| Infrared | Warm material and dusty clouds |
| X-ray | Hot inner flow and jets; cool surfaces fade |
| Radio | Magnetized flow, jets, and diffuse emission; ordinary stars and spacecraft are subdued |
| Gamma | Energetic jet regions; ordinary stars, dust, and cold surfaces become very faint |
| Geometry | Spherical body grids and outlines, a coordinate grid, and visible-light black/white-hole optics |

The five electromagnetic views are qualitative false-color views, not calibrated instrument simulations. Each component uses an illustrative emission response before compositing, with the same modeled light paths in every band. Geometry displays diagnostic grids and coordinate outlines as annotations. Fictional warp glows and the white-hole boundary source are illustrative.

Background: [NASA on black-hole emission and jets](https://www.nasa.gov/universe/what-are-black-holes/), [the EHT observing wavelengths](https://eventhorizontelescope.org/faq), and [NASA's microwave overview](https://science.nasa.gov/ems/06_microwaves/).

### Physical scale and object cameras

The 3D view uses **physical dimensions** where known, with clearly identified proxies for unmeasured small bodies. Its normal camera does not enlarge distant objects. The separate **Orbit map** compresses distances and uses equal-size schematic symbols for comparison. At size multiplier 1, reference dimensions are: ISS 109 m span, Shuttle 37.24 m length, suited astronaut 1.90 m height, classic TOS Enterprise 288.6456 m length, Earth-sized planet, and Sun-sized star. The spacecraft normalizations account for their different model proportions. The astronaut height is a reference person, not a universal suit dimension. Scaling an individual object changes that reference size proportionally; it does not change its mass.

Placement controls follow the scene. Around a black hole, objects use orbital distance, height, and phase. In **Empty space** and isolated ship scenes, positions use meters relative to a chosen object or the world origin; attached objects move with that reference and do not acquire an artificial orbit. Empty space begins with a 1,000 m view distance. Removing a parent removes its descendants; detach or reparent a child first if you want to keep it. The bridge's add control replaces its traveler with the Enterprise, NASA Shuttle, astronaut, or a speculative black-hole/white-hole marker while preserving the selected object and route clock.

True-scale spacecraft are exceptionally small next to a million-solar-mass black hole. **Track** centers a camera that follows the object and lets you orbit and zoom around it. **Ride · 360°** follows its local frame and lets you look in every direction. Onboard views hide the host exterior to keep the view unobstructed. The Objects inspector and Camera panel expose these actions for physical scene targets, including the primary and companion holes, primary planet, and disrupting star. **Reset scene view** restores the loaded scene's initial camera and target without changing its settings or clock. These are visual cameras, not a relativistic observer-tetrad calculation. Meter-scale inspections use local model coordinates to avoid floating-point loss at black-hole distances.

The **NASA Shuttle** is styled after the atmospheric Enterprise/OV-101 prototype, with test-era lettering, simulated tile patterns, and dummy engine shapes. The real vehicle did not fly orbital missions; its placement in these space scenes is fictional. The spacecraft are original procedural visual studies, not engineering replicas. See NASA's [1977 approach-and-landing test press kit](https://ntrs.nasa.gov/api/citations/19770009151/downloads/19770009151.pdf) and [history of the test program](https://ntrs.nasa.gov/api/citations/20070034951/downloads/20070034951.pdf).

### Disc styles and observer studies

**An ocean under tides** follows Pelagia, a rocky world with an ocean drawn toward the black hole. A spherical gray rocky core supports a distinct blue water bulge toward the black hole, with procedural ocean structure and reflected light. This stylized near-side displacement is not an equilibrium tide, fluid solver, or disruption prediction.

**Physical** disc color retains the selected material’s thermal-inspired palette; **Artistic** allows freely chosen colors without claiming a temperature measurement. Jets offer steady, knotted, and helical emissivity with independent color, spread, length, and brightness. **Radiant** adds brilliant blue-white plasma; **Ribbons** produces separated electric-blue currents. These procedural appearances use the lensed rays and scale their detail with render quality. They are visual emissivity choices, not calibrated chemical or fluid simulations.

**Falling into blue fire** combines the blue ribbon view with an astronaut’s prescribed cubic ease-out approach from 180 gravitational radii. Its initial onboard camera follows the apparent right-hand intersection of the black-hole edge and equatorial plane; manual camera input takes over immediately. At 1× playback it reaches the disc’s outer region around five seconds and the exterior stopping point at ten seconds, with velocity tending smoothly to zero. It slows outside the horizon at `1.035 r+ + 2 object radii`; it does not cross the horizon or solve relativistic free fall. **Looking out from the edge** begins at this exterior limit, facing outward. It is a visual camera study, not a physically hovering observer on the event horizon. The selected object's Motion control can switch between orbit, inward approach, and the outward horizon viewpoint.

Luminous probes have individual logarithmic brightness controls: `L / L0 = 10^b`, with `b` from 0 to 8. Changing luminosity changes emission and its visible halo, not physical dimensions. The multiplier is relative, not a calibrated wattage, and does not model radiation pressure or heating.

### White holes and bridge traversal

The white-hole preset reverses the radial reference-grid flow. In the ideal nonrotating spacetime, this corresponds to outgoing rather than ingoing Painlevé–Gullstrand coordinates. The exterior still bends light like a positive-mass Schwarzschild geometry. A white hole is not a negative-mass repeller, and its name does not imply a white thermal surface. The pale emission in this scene is an illustrative boundary source. White holes remain hypothetical; any added spin swirl or plasma is a schematic visual control.

The **Einstein–Rosen bridge traversal study** deliberately distinguishes two models: the Schwarzschild Einstein–Rosen bridge is **not traversable**, while the live crossing uses an ideal **Ellis wormhole**, with no event horizon. The guide explains both and provides a causal diagram plus an equatorial embedding. In proper radial distance `ell`, the Ellis metric is `ds² = -c²dt² + d ell² + (ell²+b²)dΩ²`. The live renderer integrates its optical rays in an isotropic Cartesian chart, with conformal index `n = 1+b²/(4rho²)`. Two different skies identify the two asymptotic ends; the grid is sampled along those same rays.

The selected traveler follows the prescribed demonstration path `ell(t) = 6b cos(0.12t)` through the throat and back. The throat control is in the traveler's physical model-radius units, so replacing or resizing the traveler also changes the throat's size in meters. Geometry uses the conformal factor at its center to retain its local reference dimensions; this is a local rigid-body approximation. The tracking readout is a local chart offset, not a finite geodesic distance. Tracking or riding with the traveler shows the sky change through the crossing. Each end has an independent nebula enable switch, color, shape, size, brightness, and orientation. The default crossing moves from a plain starfield into a purple filament nebula. This is not a solved propulsion problem, a stable engineered wormhole, or a passage through the nontraversable Einstein–Rosen geometry. The Ellis model requires exotic stress-energy; the demonstration does not supply it.

### Warp experiments

The warp field belongs to an Enterprise object. Select that ship in Objects to enable it and edit the field. **Explore warp** creates or selects an Enterprise in the current scene, then tracks it. One Enterprise field can be active at a time; enabling another transfers the active field, and a stopped local ship retains its current position. Bridge geometry and warp geometry are separate study modes.

- **Isolated warp laboratory:** the Enterprise and its bubble travel forward, with no black hole or bodies orbiting the ship. The camera follows while a world-anchored grid passes underneath. Toggle the stars, nebula, field outline, and grid to inspect lensing. The demonstration speed is finite and is not the fictional TNG speed in units of light speed.
- **Warp orbit:** the Enterprise and bubble move around the black hole.
- **Beyond the Horizon:** a prescribed approach-and-return path keeps the entire bubble outside the modeled event horizon. The ship turns with its direction of travel.

The field’s warp dial runs from 0 to 10 using a TNG-style interpretation; the flight slider stops just below 10. The licensed reference relation below factor 9 is approximately `v/c = W^(10/3)`; there is no unique canonical analytic extension from 9 to 10. Warp 10 is displayed as the theoretical infinite-speed limit, while the rendered field uses finite strength `min(3, 0.3 W)`. The classic TOS ship and TNG dial are an intentional crossover. The separate notebook explains the older cubic scale, source distinctions, and the exact equations used for the visual effect.

The lens is a bounded, metric-inspired optical approximation. It does not integrate full Alcubierre null geodesics, solve the combined black-hole metric, or demonstrate escape from an event horizon. Alcubierre constant-time spatial slices are intrinsically flat. The isolated scene’s display sheet deforms locally near the bubble and returns to a planar far field; this is an illustrative contraction/expansion cue, not the intrinsic geometry of an Alcubierre spatial slice. In a black-hole scene, the field deforms the common world guide’s line labels. Tracking or riding aboard the warp ship also resolves a small bubble-centered diagnostic chart while retaining the distant black-hole guide. That local chart fades between 1.6 and 2.5 bubble radii. Both use physical scale and the same shared Grid switch. The notebook presents the actual Alcubierre metric, shape function, causal structure, and negative-energy requirements separately from the visual model.

### Steering and the Alcubierre comparison

Flight stays in the plane selected at takeover. W/S changes warp factor on the Enterprise or forward acceleration on the Shuttle. A/D changes angular velocity at 0.16 rad/s², capped at ±0.65 rad/s. The slider sets warp factor or Shuttle acceleration from 0g to 10g in 0.5g steps; the readouts show speed and angular velocity. Enterprise speed is expressed in multiples of c, and Shuttle speed in meters per second. Bubble radius follows warp factor automatically: `R/r_ship = 2.4 + 0.18 W + 0.025 W²`. Wall sharpness and field strength also increase with warp factor. The size rule is an illustrative visual convention, not a Star Trek canon or relativity law.

The Enterprise field follows its center trajectory and travel frame. The notebook derives the vector-shift Alcubierre ansatz `ds² = -c²dt² + |dx - f(r_s) v_s(t)dt|²` for the prescribed planar trajectory. The spherical shape function stays spherical; turn rate changes the heading and shift direction. Setting turn rate to zero recovers the original straight-line metric, while v=0 removes the shift. At warp zero, the warp contribution to optical bending and glow vanishes. Constant-time spatial slices are flat even when four-dimensional spacetime is curved. The visible bubble, neighboring-body composition, and path preview are finite diagnostic effects, not an exact accelerating warp metric or a solved combined black-hole/warp spacetime. The near-warp-ten readout uses a bounded visual interpolation; warp ten remains the lore’s infinite-speed limit, not a simulated finite cruise setting. The Shuttle has no warp field.

Drive centers the selected vehicle in Orbit view: the Enterprise from the side, and the Shuttle from behind. Leaving Drive keeps the vehicle centered while its motion blends back to the scene route. The NASA Shuttle starts Drive with zero velocity and zero thrust. Its forward acceleration control spans 0–10g in half-g steps, with g = 9.80665 m/s². Cutting thrust preserves inertial velocity. Turning changes the vehicle’s heading; a forward burn after a 180° turn reduces the original velocity. Thrust is proper acceleration in a planar special-relativistic model: coordinate speed stays below c, and coordinate acceleration falls as the Lorentz factor grows. The telemetry shows cumulative reference-time minus proper-time difference in nanoseconds. It resets on entering or leaving Drive and when resetting the flight or scene view. The estimate omits gravitational time dilation; numerical precision is not a claim of physical accuracy. Enterprise warp motion has no special-relativistic proper-time readout. The slider marks 4–10g red as a conservative high-load warning, not a universal survival boundary; tolerance depends on duration, orientation, support, and physiology. This is not a specification of the real Shuttle’s engines. See [NASA occupant protection](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-024-acceleration.pdf).

### Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Orbit the observer | Left drag; arrow keys | Select Orbit, one-finger drag |
| Look in another direction | Middle drag; Shift + arrows | Choose Ride or Chase, then drag |
| Orbit-mode zoom | Scroll; + / − | Pinch |
| Free roam | Select Free roam, drag to aim; scroll to travel | Select Free roam, drag to aim; pinch to travel |
| Reset scene view | Home; Camera → Reset scene view | Camera → Reset scene view |
| Drive a selected ship | Properties, Camera, or Map → Drive | The same Drive action |
| Change flight power | W / S; warp or acceleration slider | Warp or acceleration slider |
| Change turn rate | Hold A / D | Tap or hold the left/right steering buttons |
| End a burn / stop warp motion | Shuttle: Cut thrust; Enterprise: Stop motion | Same controls |
| Hand back to orbit | Resume orbit; Esc | Resume orbit |
| Change map scope | Double-click a body; ancestor breadcrumb | Double-tap a body; ancestor breadcrumb |

Orbit and orbit-mode zoom recenter the gaze. Look changes direction without moving the observer; scroll is ignored during an active look drag. Ride and Chase let you look around the selected body; zooming out returns to tracking. Free roam travels along the chosen heading. Pinch owns the gesture until all fingers lift. **Picture → Quick** captures the current live view, using the compatible displayed frame if a finer shader is still compiling.

### Immersive VR

Camera → **Enter VR** requests a WebXR `immersive-vr` session when the browser reports support. The view uses each eye's supplied projection and tracked pose. Select a body and choose Track or Ride before entering; the chosen camera anchors the headset view. Exit using the headset/browser's session controls to return to the ordinary view.

WebXR requires a secure context, compatible browser and headset runtime, and permission to start a session. Ordinary 360° viewing is available independently of VR support.

### Picture studio

**Picture** is separate from the live Ultra quality setting. Refinement freezes the scene and camera, renders an image in small tiles, then shows a preview with a PNG download. Cancel returns to the live view and restores its prior pause, camera, and quality state.

| Preset | Time budget | Target long edge | Sampling / maximum ray steps |
| --- | ---: | ---: | ---: |
| Quick | Current frame | Live resolution | Live quality |
| Higher resolution | 10 seconds | Up to 2,560 px | Progressive / 1,024 |
| Maximum | 2 minutes | Up to 3,840 px | Progressive / 3,072 |

Preparation, sampling, and PNG encoding report their current stage. Capture runs independently of the live animation loop and remains cancellable. If a browser cannot include the optional label overlay, the scene image is retained and the result identifies the omission.

Measured GPU throughput selects the working resolution. Refinement adds finer procedural plasma and nebula structure, more ray integration, and progressively accumulated subpixel samples. The renderer uses the remaining work budget for new samples rather than stopping at a fixed count. Complete checkpoints protect the best available image; final PNG encoding has a small reserved allowance. The preview retains the best complete image within the work budget and reports its achieved resolution and sample count or range. Sampling is accumulated in linear light with bounded memory. On slower devices, this may be the original live capture.

Aspect ratio is preserved, with a maximum of 8,294,400 pixels. Rendering uses 64×64 tiles and produces an 8-bit PNG. Quick also captures the CPU preview; higher levels require WebGL. Live Ultra quality remains a separate manual option.

## Performance behavior

Adaptive selects the same Low, Medium, and High presets available manually. It starts conservatively, steps down after sustained cadence below 30 FPS, and tests higher quality again after a stable interval. Ultra remains a manual option. The status readout shows the active tier and frame rate.

The full Solar System catalog remains available to the tree, map, labels, and cameras. Large authored catalogs retain validated templates in memory for subsequent scene loads; each visit creates independent objects, so scene edits do not change the template. Detailed shading is limited to relevant visible bodies. Negligible weak-field contributions are omitted from costly light-ray integration, while physical masses and prescribed orbital motion remain intact. Close-up surface detail is concentrated on the inspected world; distant subpixel bodies do not receive the same expensive surface work.

Where supported, a local Worker and OffscreenCanvas separate rendering from the interface. Camera updates replace older pending updates, GPU submissions use nonblocking fences, and the CPU preview yields between drawing batches. Scene loading includes a retry action when rendering fails.

Geometry mode renders shaded gray stars and planets along the same optical rays as the scene, including lensing and foreground occlusion. The surrounding grid remains a coordinate diagnostic within the approximate optical model. The compact-star orbital study slows its simulation clock to show a circuit in roughly 30 seconds, without changing the modeled orbit size or mass.

### Paused views

Pausing keeps the selected live quality and camera controls active. Use **Picture studio** for high-resolution image rendering.

### CPU preview when WebGL is unavailable

The site attempts WebGL first. If WebGL cannot start, it offers a low-fidelity CPU preview or a retry of GPU rendering. Adaptive quality handles low GPU frame rates within the WebGL renderer.

The CPU preview uses Canvas 2D, capped at 640×420 pixels. It targets 15–30 draws per second, adjusting geometry density and drawing intervals to device performance.

It supports camera navigation, physical object sizes, contextual placement, grid controls, both bridge skies, Ride/Chase views, and qualitative spectral colors. Projected shapes and glows provide a schematic view. Current-frame image saving is available; VR and high-resolution Picture studio require WebGL.

## Source and rebuilding

- `index.html`: self-contained offline entry point.
- `dist/`: readable source modules, CSS, HTML, local SVG, embedded planetary maps, and scene thumbnails.
- `dist/render-host.js`, `dist/render-worker.js`, and `dist/render-state.js`: main-thread interaction controller, local rendering worker, and plain-data state transfer. The generated worker bundle is included for offline use.
- `scripts/build-offline.mjs`: dependency-free bundler that regenerates the root `index.html` from `dist/`.
- `tests/`: configuration, renderer-state, and standalone-bundle checks.
- `LICENSE`: MIT license.

To modify the project, edit `dist/`, then run the following with Node.js 22 or newer:

```sh
node scripts/build-offline.mjs
npm test
```

No `npm install` is needed; there are no package dependencies. The generated root `index.html` embeds all runtime modules and assets. `dist/` contains the corresponding readable source.

## Runtime architecture

Rendering uses WebGL2, with a WebGL1 fallback and an optional Canvas 2D CPU preview. The standalone `index.html` embeds the runtime modules, worker bundle, procedural models, diagrams, catalog data, thumbnails, and reference surface maps. Surface maps are decoded locally as needed, and the page can run offline.

## Model boundaries

The renderer integrates a Schwarzschild-inspired Cartesian light-bending model with explicit midpoint steps. Spin adds an illustrative transverse term and exact scalar Kerr horizon/ISCO radii. It is not a full Kerr geodesic or relativistic fluid solver. The math guide distinguishes exact theory from the implemented approximations.

The rendering world uses the default mass as a fixed reference, so changing mass changes horizon size without automatically moving the observer. Displayed distances use the primary hole's gravitational radius, `r_g = GM/c²`. The dark apparent shadow differs from the event horizon. Exterior contours follow the lensed capture silhouette. Coordinate inner/outer horizon curves appear only in the Interior geometry cutaway; Locator provides separate explanatory labels. None is light emitted by a horizon.

Ordinary binary motion is prescribed around the barycenter, with Roche-limited local discs and independently aligned jets. Merger presets add a prescribed inward motion and visual endpoint. An optional amplified quadrupolar grid cue illustrates gravitational waves; neither feature is a numerical-relativity calculation, a calibrated strain, or a prediction of remnant mass/spin. Black-hole–white-hole orbits and collisions are speculative comparisons, not solutions or annihilation claims. Combined lens fields, tidal debris, spacecraft trajectories, and plasma are approximate. Spectral views use false-color emission weights; composition options are visual templates, not resolved spectroscopy. Planetary diagnostics use mass and radius. Bodies use physical reference dimensions, and their backreaction is neglected. The continuous grid is a virtual luminous coordinate guide sampled along the same approximate bent light rays as the scene. It is anchored to the modeled holes, including both centers in a binary. Animated marks fall radially inward around an isolated nonspinning hole; spin adds an illustrative angular cue. Their motion weakens toward a stationary far field. This is a display convention, not an exact Kerr/binary spatial embedding or a physical spacetime fabric.

Ordinary black-hole cameras remain outside modeled capture surfaces. The separate **Interior geometry** cutaway permits a diagnostic interior view and singularity annotation; it does not simulate an infalling observer’s relativistic local frame or a visible material singularity. An infaller can receive outside light after crossing a future horizon, but cannot send a signal back out. Frequency shifts depend on observer motion and ray direction, not a universal freezing of the outside universe. The ideal Kerr inner horizon is unstable to perturbations. Motion uses accelerated visual time. Close inward views can become fully dark; look outward to inspect the surrounding sky. The Ellis bridge has no capture horizon and uses its separate metric and camera chart. Its numerical ray integration has finite step and boundary limits; the ship route and colored skies are demonstration choices.

### Loading animation

The loading animation shows a four-second symbolic orbit. Behind the black hole, the orbiting body splits into two images around the shadow and smoothly rejoins. The embedded GIF uses a simplified geometric projection; reduced-motion settings use a static SVG.

Regenerate the loading assets with `python3 scripts/generate-loading-orbit.py` and Pillow installed.

## License and credits

Author: [Dr. Luke A. Wendt](https://github.com/Luke-A-Wendt) · Co-author: [Astra Ultra](https://openai.com/index/gpt-6-astra/)

The source code, original procedural implementation, diagrams, and original scene artwork are provided under the [MIT License](LICENSE), copyright 2026 Dr. Luke A. Wendt and contributors. Bundled reference maps and map-derived previews retain their NASA/mission credits and applicable image-use terms in [Surface credits](dist/SURFACE_CREDITS.md); the MIT license does not relicense those source images. No downloaded third-party spacecraft meshes are used. Scientific references and visual inspirations, including [kavan010/black_hole](https://github.com/kavan010/black_hole) and [Orbital Atlas](https://github.com/Luke-A-Wendt/orbital-atlas), are acknowledged in the guide; this is an independent browser implementation.

ISS, Space Shuttle, and Starship Enterprise names identify the subjects of the stylized models. This project is unaffiliated with NASA or the Star Trek rights holders. The MIT license covers this project's code and original implementation; it does not grant rights to third-party names, trademarks, or underlying fictional designs.

Dimension references: [NASA Shuttle technical diagrams](https://www.nasa.gov/gallery/space-shuttle-technical-diagrams/), [NASA ISS facts](https://www.nasa.gov/international-space-station/space-station-facts-and-figures/), and the [Smithsonian TOS Enterprise collection record](https://airandspace.si.edu/collection-objects/model-starship-enterprise-television-show-star-trek/nasm_A19740668000).
