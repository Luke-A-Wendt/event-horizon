# Event Horizon

An interactive spacetime observatory that runs entirely on your own device. Fly around black holes, change their mass and spin, assemble scenes, place orbiting objects, inspect a white-hole model, traverse an illustrative wormhole, and explore the mathematics.

[Event Horizon](https://luke-a-wendt.github.io/event-horizon/)

<img width="1233" height="766" alt="image" src="https://github.com/user-attachments/assets/bad77f02-788f-4253-a7a8-0889ccaf60bc" />

## Explore

The Scenes gallery has 29 presets, including spacecraft inspections, an astronaut's slow inward approach, bright plasma ribbons, an outward horizon viewpoint, **Radio observatory**, and **Gamma-ray engine**. Einstein alignment starts with a shared grid and an offset view of both holes; Polar engine starts with a larger mass, near-maximal spin, and the grid enabled.

- The default is the original starfield and warm accretion disc. The Scenes gallery offers distinct starting points, including warp experiments, spectral surveys, spacecraft inspections, and composite black-hole systems.
- Use **Scenes** for complete starting points. The viewing panel's compact dock provides **Elements**, **Camera**, **Display**, **Pause / Play**, **Picture**, and **Help**, including in fullscreen. Open Elements to toggle components or select one; its **Properties** inspector opens directly with the relevant controls. The disc, stars, background nebula, planet, disrupting star, companion, and jets can be enabled separately. **Grid** is one shared switch: every grid control enables or disables the metric guides together. Panels close with their close button or a click on the canvas.
- Adjust mass, dimensionless spin, colors, disc appearance and size, nebula structure, planet properties, stellar disruption, and both black holes' spin axes.
- Switch the entire scene between **Visible**, **Infrared**, **X-ray**, **Radio / mm**, and **Gamma** emission views. Every material and emission component has a band response, including the sky and spacecraft. Diagnostic grids and outlines retain their annotation colors. These are qualitative false-color views, not calibrated instrument simulations.
- Place up to ten additional planets, stars, probes, ISS models, NASA Shuttles, astronauts, or Starship Enterprises. Select an object in **Elements** to edit its size and placement, delete it, track it, or enter its onboard 360° view. The models remain procedural approximations; spacecraft structure, NASA markings, suit seams, a reflective gold visor, and the classic Enterprise are generated locally.
- **Adaptive** selects the same **Low**, **Medium**, or **High** presets available in the menu, aiming to keep at least 30 FPS. The readout identifies its current preset. It never uses a hidden quality below Low and never selects Ultra automatically. Manually selected modes retain their full preset. **Ultra** offers 768 ray steps, up to 16 million render pixels within hardware limits, supersampling, and richer disc and nebula detail; it remains available for detailed images even at a low frame rate.
- Open the mathematics guide or the separate warp field notebook for equations, diagrams, assumptions, and references. The main guide includes white holes, the nontraversable Einstein–Rosen bridge, and the Ellis metric used for the traversal study. Equations use native MathML and diagrams use inline SVG.

### Five spectral views

Radio and gamma radiation can reveal material around a black hole, including its energetic jets. The event horizon itself remains dark. **Radio / mm** combines a radio-emission study with millimeter-wave emphasis; microwaves belong to the high-frequency part of the radio spectrum, so there is no redundant microwave filter. EHT observations at millimeter wavelengths motivate the compact-flow view, but these images do not reproduce a telescope's resolution, sensitivity, or data processing.

| View | Visual emphasis |
| --- | --- |
| Visible | Familiar stars, reflected surfaces, and glowing plasma |
| Infrared | Warm material and dusty clouds |
| X-ray | Hot inner flow and jets; cool surfaces fade |
| Radio / mm | Magnetized flow, jets, and diffuse emission; ordinary stars and spacecraft are subdued |
| Gamma | Energetic jet regions; ordinary stars, dust, and cold surfaces become very faint |

Each component uses an illustrative emission response before compositing; this is not a color filter over a finished visible image. The camera still follows the same modeled light paths. There is no simulated detector, calibrated spectrum, particle distribution, polarization, cosmic microwave background, or instrument noise. Fictional warp glows and the white-hole boundary source remain illustrative. Diagnostic grids and coordinate outlines are annotations, not emitted astronomical light.

Background: [NASA on black-hole emission and jets](https://www.nasa.gov/universe/what-are-black-holes/), [the EHT observing wavelengths](https://eventhorizontelescope.org/faq), and [NASA's microwave overview](https://science.nasa.gov/ems/06_microwaves/).

### Physical scale and object cameras

Every object uses **physical dimensions**. There is no enlarged display mode. At size multiplier 1, reference dimensions are: ISS 109 m span, Shuttle 37.24 m length, suited astronaut 1.90 m height, classic TOS Enterprise 288.6456 m length, Earth-sized planet, and Sun-sized star. The spacecraft normalizations account for their different model proportions. The astronaut height is a reference person, not a universal suit dimension. Scaling an individual object changes that reference size proportionally; it does not change its mass.

Placement controls follow the scene. Around a black hole, objects use orbital distance, height, and phase. In **Empty space** and isolated ship scenes, positions use meters relative to a chosen object or the world origin; attached objects move with that reference and do not acquire an artificial orbit. Empty space begins with a 1,000 m view distance. Removing a reference preserves its children's current world positions. The bridge's add control replaces its traveler with the Enterprise, NASA Shuttle, or astronaut while preserving the selected object and route clock.

True-scale spacecraft are exceptionally small next to a million-solar-mass black hole. **Track** centers a camera that follows the object and lets you orbit and zoom around it. **Ride · 360°** follows its local frame and lets you look in every direction. The NASA Shuttle has a separate **Cockpit view** action in its selected-object controls. It starts facing forward inside an illustrative flight deck; drag to look around or use the cockpit-forward action to recenter: the windows reveal the live scene, while the cockpit stays oriented with the vehicle. Other onboard views hide the host exterior to keep the view unobstructed. The Elements inspector and Camera panel expose these actions for physical scene targets, including the primary and companion holes, primary planet, and disrupting star. **Previous view** is a compact action inside Camera, not a persistent banner. **Reset scene view** restores the loaded scene's initial camera and target without changing its settings or clock. These are visual cameras, not a relativistic observer-tetrad calculation. Meter-scale inspections use local model coordinates to avoid floating-point loss at black-hole distances.

The **NASA Shuttle** is styled after the atmospheric Enterprise/OV-101 prototype, with test-era lettering, simulated tile patterns, and dummy engine shapes. The real vehicle did not fly orbital missions; its placement in these space scenes is fictional. The cockpit and spacecraft are original procedural visual studies, not engineering replicas. See NASA's [1977 approach-and-landing test press kit](https://ntrs.nasa.gov/api/citations/19770009152/downloads/19770009152.pdf) and [history of the test program](https://ntrs.nasa.gov/api/citations/20070034952/downloads/20070034952.pdf).

### Disc styles and observer studies

**Radiant** adds brilliant blue-white plasma; **Ribbons** produces separated electric-blue currents. These original procedural appearances use the existing lensed rays and scale their detail with render quality. They are visual emissivity choices, not calibrated chemical or fluid simulations, and do not change the original warm default disc.

**Into blue fire** moves its astronaut inward along a prescribed exponential path with a 75-unit display-time scale. It slows outside the horizon at `1.035 r+ + 2 object radii`; it does not cross the horizon or solve relativistic free fall. **Looking back from the edge** begins at this exterior limit, facing outward. It is a visual camera study, not a physically hovering observer on the event horizon. The selected object's Motion control can switch between orbit, inward approach, and the outward horizon viewpoint.

Luminous probes have individual logarithmic brightness controls: `L / L0 = 10^b`, with `b` from 0 to 8. Changing luminosity changes emission and its visible halo, not physical dimensions. The multiplier is relative, not a calibrated wattage, and does not model radiation pressure or heating.

### White holes and bridge traversal

The white-hole preset reverses the radial reference-grid flow. In the ideal nonrotating spacetime, this corresponds to outgoing rather than ingoing Painlevé–Gullstrand coordinates. The exterior still bends light like a positive-mass Schwarzschild geometry. A white hole is not a negative-mass repeller, and its name does not imply a white thermal surface. The pale emission in this scene is an illustrative boundary source. White holes remain hypothetical; any added spin swirl or plasma is a schematic visual control.

The **Einstein–Rosen bridge traversal study** deliberately distinguishes two models: the Schwarzschild Einstein–Rosen bridge is **not traversable**, while the live crossing uses an ideal **Ellis wormhole**, with no event horizon. The guide explains both and provides a causal diagram plus an equatorial embedding. In proper radial distance `ell`, the Ellis metric is `ds² = -c²dt² + d ell² + (ell²+b²)dΩ²`. The live renderer integrates its optical rays in an isotropic Cartesian chart, with conformal index `n = 1+b²/(4rho²)`. Two different skies identify the two asymptotic ends; the grid is sampled along those same rays.

The selected traveler follows the prescribed demonstration path `ell(t) = 6b cos(0.12t)` through the throat and back. The throat control is in the traveler's physical model-radius units, so replacing or resizing the traveler also changes the throat's size in meters. Geometry uses the conformal factor at its center to retain its local reference dimensions; this is a local rigid-body approximation. The tracking readout is a local chart offset, not a finite geodesic distance. Tracking or riding with the traveler shows the sky change through the crossing. Each end has an independent nebula enable switch, color, shape, size, brightness, and orientation. The default crossing moves from a plain starfield into a purple filament nebula. This is not a solved propulsion problem, a stable engineered wormhole, or a passage through the nontraversable Einstein–Rosen geometry. The Ellis model requires exotic stress-energy; the demonstration does not supply it.

### Warp experiments

The warp field belongs to an Enterprise object. Select that ship in Elements to enable it and edit the field. **Explore warp** creates or selects a real Enterprise in the current scene, then tracks it. One Enterprise field can be active at a time; enabling another transfers the active field, and a stopped local ship retains its current position. Bridge geometry and warp geometry are separate study modes.

- **Isolated warp laboratory:** the Enterprise and its bubble travel forward, with no black hole or bodies orbiting the ship. The camera follows while a world-anchored grid passes underneath. Toggle the stars, nebula, field outline, and grid to inspect lensing. The demonstration speed is finite and is not the fictional TNG speed in units of light speed.
- **Warp orbit:** the Enterprise and bubble move around the black hole.
- **Horizon excursion:** a prescribed approach-and-return path keeps the entire bubble outside the modeled capture surface. The ship turns with its direction of travel.

The warp dial runs from 0 to 10 using a TNG-style interpretation. The licensed reference relation below factor 9 is approximately `v/c = W^(10/3)`; there is no unique canonical analytic extension from 9 to 10. Warp 10 is displayed as the theoretical infinite-speed limit, while the rendered field uses finite strength `min(3, 0.3 W)`. The classic TOS ship and TNG dial are an intentional crossover. The separate notebook explains the older cubic scale, source distinctions, and the exact equations used for the visual effect.

The lens is a bounded, metric-inspired optical approximation. It does not integrate full Alcubierre null geodesics, solve the combined black-hole metric, or demonstrate escape from an event horizon. Alcubierre constant-time spatial slices are intrinsically flat. The isolated scene’s raised/lowered reference sheet is a schematic expansion/contraction display, now viewed through the same bent rays as the scene. In a black-hole scene, the field deforms the common world guide’s line labels. Tracking or riding aboard the warp ship also resolves a small bubble-centered diagnostic chart while retaining the distant black-hole guide. That local chart fades between 1.6 and 2.5 bubble radii, so it does not add a second infinite plane. Both use physical scale and the same shared Grid switch. The notebook presents the actual Alcubierre metric, shape function, causal structure, and negative-energy requirements separately from the visual model.

### Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Orbit the observer | Left drag; arrow keys | Select Orbit, one-finger drag |
| Look in another direction | Middle drag; Shift + arrows | Select Look 360°, one-finger drag |
| Orbit-mode zoom | Scroll; + / − | Pinch |
| Free roam | Select Free roam, drag to aim; scroll to travel | Select Free roam, drag to aim; pinch to travel |
| Reset scene view | Home; Camera → Reset scene view | Camera → Reset scene view |

Orbit and orbit-mode zoom recenter the gaze. Look changes direction without moving the observer; scroll is ignored during an active look drag. Free roam travels along the chosen heading. Pinch owns the gesture until all fingers lift. Inward, Across disc, and Outward provide gaze shortcuts. The optional Near horizon view stays outside a single black hole; the automatic Approach horizon button has been removed. Maximum orbit distance is 5,000 gravitational radii. Display → Save image exports a fresh frame at the current live quality.

### Immersive VR

Camera → **Enter VR** requests a WebXR `immersive-vr` session when the browser reports support. The view uses each eye's supplied projection and tracked pose. Select a body and choose Track or Ride before entering; the chosen camera anchors the headset view. Exit using the headset/browser's session controls to return to the ordinary view. Rendering remains local, and no account or remote compute service is used.

WebXR is available only in secure contexts and depends on the browser, runtime, headset, and permissions. An initial support check is advisory; a session may still be unavailable or denied. HTTPS hosting or `localhost` is the practical route; a downloaded `file://` page is not a portable guarantee of immersive access. Ordinary 360° viewing and the rest of the standalone site remain available offline. This revision has not been tested on a physical headset.

### Picture studio

**Picture** is separate from the live Ultra quality setting. It freezes the scene and camera, renders an image in small tiles, then shows a preview with a PNG download. Cancel returns to the live view and restores its prior pause, camera, and quality state.

| Preset | Long edge | Samples per pixel | Maximum ray steps |
| --- | ---: | ---: | ---: |
| HD | 1,920 px | 4 | 1,024 |
| 4K | 3,840 px | 8 | 1,536 |
| 4K maximum | 3,840 px | 16 | 3,072 |

Aspect ratio is preserved, with an 8,294,400-pixel ceiling. Picture mode uses a separate shader with longer ray integration, additional advected plasma structure in the disc, and finer nebula filaments. Higher presets add procedural frequencies and noise octaves; pixel-footprint filtering limits detail too small for the output image. No texture downloads or large model files are involved. Live Ultra retains its 768-step ceiling and is unaffected by these additional photo calculations.

Each output pixel combines distinct subpixel rays using floating-point accumulation in linear light. The individual shader samples are tone-mapped to the current 8-bit readback format before accumulation, so this is not a raw HDR export. More samples reduce aliasing, while the additional procedural work supplies detail beyond simply enlarging the live image. These budgets do not guarantee that every pixel or scene looks better at each higher preset, and they do not improve the underlying physics model. The time estimate is extrapolated from completed work; shader compilation and PNG encoding have separate status stages.

Rendering uses small 64×64 tiles. WebGL2 reads them back through a pixel buffer with nonblocking fence polling, batching four samples at the first two presets and two at maximum; WebGL1 yields between small readbacks. This bounds queued work but cannot guarantee a driver completion time. Output pixels use about 33 MiB at 4K, plus browser and image-encoder overhead. Picture mode is unavailable in the CPU preview or during VR. Hiding the page, losing the graphics context, or cancelling ends the render cleanly.

## Performance behavior

Where Workers and OffscreenCanvas graphics are available, shader compilation, GPU submissions, Canvas 2D painting, and Picture studio run in a dedicated local render worker. The page keeps input, menus, camera controls, and scene state on the main thread. Only the latest pending state is sent while an earlier update is being processed, preventing fast slider or drag gestures from building a long queue. Scene transitions show a loading indicator while the new view is prepared; picture rendering reports measured progress. FPS and the effective quality remain visible in the viewport.

Selecting a scene closes the gallery and shows **Loading** before scene construction begins. A newer choice replaces any pending choice. The indicator waits for a completed frame from the current scene revision. Invalid CPU drawing commands, reported rendering errors, and elapsed load deadlines show **Failed to load**, with **Retry** and **Choose another scene** actions. The deadline without a matching complete frame is 15 seconds of active time in CPU mode or 30 seconds in GPU mode; time with a hidden page or suspended view is excluded, and detected errors can fail sooner. These are recovery deadlines, not promises of hardware completion times. Retry preserves the scene and its selected CPU or GPU backend.

The quality/FPS readout is informational; use **Display** to change quality. Its fixed columns keep the mode label stationary as the effective tier and FPS change.

The CPU notice identifies whether it uses worker drawing, worker geometry, or cooperative fallback. The worker is created from source bundled inside the page as a local Blob; it needs no worker download, server, cache, or service worker. CPU mode also supports browsers with Workers but without OffscreenCanvas: geometry is generated in a worker, and the page plays a bounded Canvas command stream into a back buffer in small tasks, presenting complete frames only. At most one frame is in flight. If no Worker can start, the CPU geometry and painting yield cooperatively between small batches. GPU rendering without worker graphics still uses the ordinary main-window backend. If worker WebGL is unavailable, ordinary WebGL is tried before offering the CPU preview. Worker isolation keeps renderer JavaScript out of the UI event loop, but cannot guarantee that a browser, graphics driver, memory shortage, or operating system will never stall. WebXR requires the main-window graphics path; entering and leaving VR transfers the scene state between backends using a fresh canvas.

Adaptive begins at Low and tests higher presets after a brief stable interval. A capable desktop can quickly reach High; a High view running at 50–60 FPS stays High. Sustained completed-frame cadence below 30 FPS selects a lower preset. Adaptive periodically tests higher quality again, with a cooldown after an unsuccessful trial to avoid rapid switching. It never drops below the actual Low preset or chooses Ultra. The current preset and frame rate are shown together.

| Setting | Maximum ray steps | Pixel budget |
| --- | ---: | ---: |
| Adaptive | Selects Low, Medium, or High | Uses that preset exactly |
| Low | 96 | 600,000 |
| Medium | 160 | 1,400,000 |
| High | 256 | 2,800,000 |
| Ultra | 768 | 16,000,000 |

Actual render dimensions also depend on the viewport, pixel density, and device limits. Selecting a mode manually keeps its exact profile; the renderer does not silently soften it. Ultra is manual only. **Save image** waits for the selected shader to be ready and captures a newly drawn frame, including slow Ultra frames.

WebGL2 polls one outstanding GPU frame without blocking and skips new submissions while that frame is unfinished. Completed-frame cadence drives Adaptive; a delayed fence poll is not treated as a precise GPU timer. Without fence support, the renderer uses conservative submission pacing. Hidden pages and full-screen modal guides suspend rendering without changing the selected quality. Timing is reset on resume so time spent reading a guide does not count as slow rendering. Shader warm-up and isolated timing interruptions do not permanently reduce quality.

The default shader omits unused spacecraft, warp, bridge, and grid code. Specialized programs contain only the spacecraft models currently needed, with their complete geometry intact. Programs are compiled when required and reused locally; the 768-step live shader is requested by Ultra, while Picture studio builds its separate higher-detail variant on demand. Where `KHR_parallel_shader_compile` is available, compilation readiness is polled without blocking. A compatible completed program remains usable while a replacement compiles; if a newly required feature needs another program, the last image is held until it is ready. Browsers without that extension still perform driver compilation synchronously, and some drivers defer additional compilation until the first draw. Shorter shader variants reduce work but cannot guarantee a stall-free driver.

Browser API references: [HTML Workers](https://html.spec.whatwg.org/multipage/workers.html), [OffscreenCanvas and canvas transfer](https://html.spec.whatwg.org/multipage/canvas.html), [worker animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html), and the [WebXR Device API](https://www.w3.org/TR/webxr/).

These changes have automated coverage; they are not a claim of measured Samsung S9 or Valve hardware performance. The default remains Adaptive, and the status readout shows its current response to load.

### CPU preview when WebGL is unavailable

The site attempts WebGL first. Only when that API cannot start does it offer a choice to continue with a low-fidelity CPU preview or retry GPU rendering. It never switches to this preview merely because the GPU frame rate is low. A web page cannot reliably prove that a physical GPU is absent: WebGL may also be blocked by a browser setting or driver policy. The prompt therefore describes unavailable graphics access, not missing hardware.

The CPU preview uses Canvas 2D, capped at 640×420 pixels. It targets 30 draws per second, adjusting its geometry density and submission interval toward 15 Hz when measured drawing cost rises, then restoring detail when the load falls. This is a separate schematic backend, not a hidden GPU quality below Low. It caches star directions, colors, and circle angles, and projects the grid without allocating a point array for every sample. Rendering still depends on device capability; the scheduled range is not a guaranteed achieved frame rate.

It retains camera navigation, physical object sizes, contextual placement, grid controls, both bridge skies, a simple shuttle cockpit, and qualitative spectral colors, using projected shapes and glows instead of the GPU's ray integration and detailed geometry. A persistent viewport notice explains the quality difference. Current-frame image saving works, including from the worker canvas; VR and high-resolution Picture studio require WebGL. The preview is designed to keep the interface usable on older devices, not to match the GPU's optics or visual fidelity.

## Source and rebuilding

- `index.html`: ready-to-run, self-contained offline and GitHub Pages entry point.
- `dist/`: readable source modules, CSS, HTML, local SVG, and original scene thumbnails. It can also be served directly as a static website.
- `dist/render-host.js`, `dist/render-worker.js`, and `dist/render-state.js`: main-thread interaction controller, local rendering worker, and plain-data state transfer. The generated worker bundle is included for offline use.
- `scripts/build-offline.mjs`: dependency-free bundler that regenerates the root `index.html` from `dist/`.
- `tests/`: configuration, renderer-state, and standalone-bundle checks.
- `LICENSE`: MIT license.

To modify the project, edit `dist/`, then run the following with Node.js 22 or newer:

```sh
node scripts/build-offline.mjs
npm test
```

No `npm install` is needed; there are no package dependencies. Commit the regenerated root `index.html` along with the source. For source-module development, optionally serve `dist/` using any local static server. Directly opening `dist/index.html` may be blocked by browser restrictions on ES modules over `file://`; open the root standalone `index.html` instead.

## Privacy and offline design

There are no passwords, API keys, authentication flows, telemetry, analytics, external fonts, external textures, runtime downloads, cloud computations, or external model assets in the export. Rendering uses the local GPU through WebGL2, with a WebGL1 fallback and an explicit opt-in Canvas 2D CPU preview when WebGL is unavailable. The archive excludes deployment configuration, Git history, credentials, and account identifiers. It does not rely on a browser cache, service worker, previously downloaded files, or a network connection: all runtime content is embedded in the standalone entry point. All procedural models, scientific diagrams, and thumbnails are included.

## Model boundaries

The renderer integrates a Schwarzschild-inspired Cartesian light-bending model with explicit midpoint steps. Spin adds an illustrative transverse term and exact scalar Kerr horizon/ISCO radii. It is not a full Kerr geodesic or relativistic fluid solver. The math guide distinguishes exact theory from the implemented approximations.

The rendering world uses the default mass as a fixed reference, so changing mass changes horizon size without automatically moving the observer. Displayed distances use the primary hole's gravitational radius, `r_g = GM/c²`. The dark apparent shadow differs from the event horizon; the optional cyan horizon guide is unlensed coordinate geometry.

Binary motion is prescribed around the barycenter, with Roche-limited local discs and independently aligned jets. Combined lens fields, tidal debris, spacecraft trajectories, and plasma are approximate. Spectral views use false-color emission weights; composition options are visual templates, not resolved spectroscopy. Planetary diagnostics use mass and radius. Bodies use physical reference dimensions, and their backreaction is neglected. The continuous grid is a virtual luminous coordinate guide sampled along the same approximate bent light rays as the scene. It is anchored to the modeled holes, including both centers in a binary. Animated marks fall radially inward around an isolated nonspinning hole; spin adds an illustrative angular cue. Their motion weakens toward a stationary far field. This is a display convention, not an exact Kerr/binary spatial embedding or a physical spacetime fabric.

The black-hole camera remains outside modeled capture surfaces and does not simulate an infalling observer's relativistic local frame. Motion uses accelerated visual time. Close inward views can become fully dark; look outward to inspect the surrounding sky. The Ellis bridge has no capture horizon and uses its separate metric and camera chart. Its numerical ray integration has finite step and boundary limits; the ship route and colored skies are demonstration choices.

### Loading animation

The local loading GIF is a four-second, 80-frame symbolic orbit. A rear-side point splits into a direct and an elevated lensed image; the central shadow occults the direct image before the paths smoothly rejoin. It is a simplified geometric symbol, not a new ray-tracing solver. The GIF is preloaded, requires no animation JavaScript, and is embedded in the standalone page. Reduced-motion settings use a static SVG.

The committed assets are ready to use. Optional regeneration uses `python3 scripts/generate-loading-orbit.py` with Pillow installed; Python and Pillow are not browser or normal build dependencies.

## Validation

Automated checks cover geometry scalars, presets, physical scaling, contextual placement and reference trees, traveler replacement, camera continuity, adaptive quality, worker state transport, scene-revision readiness, failure/retry recovery, five-band emission routing, loading and DOM interactions, resource cleanup, photo-tile scheduling, mock WebXR eye projections and session lifecycle, publication credits/license, and standalone resource closure. The DOM, worker, and graphics harnesses exercise logic; they do not emulate a complete browser. Shader fixtures are recorded from the actual renderer. Native offscreen OpenGL ES checks cover the live and photo shaders, bridge sky transitions, spacecraft and cockpit views, physical scaling, warp scenes, the WebGL1 path, and exact agreement between a photo tile and its full-image crop.

This revision was not tested on a physical phone or headset, and browser layout and real touch behavior were not visually verified because the managed browser preview was unavailable. The checks do not establish Samsung S9 or Valve device frame rates, headset comfort, or universal browser compatibility.

## License and credits

Author: [Dr. Luke A. Wendt](https://github.com/Luke-A-Wendt) · Co-author: [Astra Ultra](https://openai.com/index/gpt-6-astra/)

The source code, procedural model implementation, diagrams, and included scene thumbnails are provided under the [MIT License](LICENSE), copyright 2026 Dr. Luke A. Wendt and contributors. The models use no downloaded third-party meshes or textures. Scientific references and visual inspirations, including [kavan010/black_hole](https://github.com/kavan010/black_hole) and [Orbital Atlas](https://github.com/Luke-A-Wendt/orbital-atlas), are acknowledged in the guide; this is an independent browser implementation.

ISS, Space Shuttle, and Starship Enterprise names identify the subjects of the stylized models. This project is unaffiliated with NASA or the Star Trek rights holders. The MIT license covers this project's code and original implementation; it does not grant rights to third-party names, trademarks, or underlying fictional designs.

Dimension references: [NASA Shuttle technical diagrams](https://www.nasa.gov/gallery/space-shuttle-technical-diagrams/), [NASA ISS facts](https://www.nasa.gov/international-space-station/space-station-facts-and-figures/), and the [Smithsonian TOS Enterprise collection record](https://airandspace.si.edu/collection-objects/model-starship-enterprise-television-show-star-trek/nasm_A19740668000).
