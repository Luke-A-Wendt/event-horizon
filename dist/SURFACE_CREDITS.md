# Planetary surface imagery

The application embeds resized JPEG versions of the following public NASA/USGS mission products. They are local assets, not runtime downloads. The project's MIT license applies to its original code; it does not relicense these source images. NASA's image-use guidance and each credited mission product apply. The project is not endorsed by NASA, JPL, Caltech, USGS, or the mission teams.

| Bodies / embedded width | Product and credit |
| --- | --- |
| Earth — 4096 px | [Blue Marble Next Generation, December 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/), NASA Earth Observatory / Reto Stöckli and Robert Simmon. MODIS-derived surface mosaic with topographic shading and plain oceans. Added clouds are procedural, not current weather. |
| Moon — 4096 px | [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), NASA Goddard Scientific Visualization Studio / Ernie Wright; Lunar Reconnaissance Orbiter Camera and laser-altimeter teams. Source: `lroc_color_poles_4k.tif`. |
| Mars — 1440 px | [Mars Image Texture](https://science.nasa.gov/3d-resources/mars/), NASA/JPL-Caltech; Viking imagery processed at USGS, from the JPL Solar System Simulator map collection. |
| Jupiter — 2048 px | [Cassini's Best Maps of Jupiter, PIA07782](https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/), NASA/JPL/Space Science Institute. Cylindrical mosaic from December 2000 observations, including the Great Red Spot. The weather pattern is a historical observation, not a current state. |
| Pluto — 2048 px | [Pluto Color Map, PIA11707](https://science.nasa.gov/photojournal/pluto-color-map/), NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute; New Horizons MVIC observations from July 2015. |
| Charon — 2048 px | [Global Map of Pluto's Moon Charon, PIA19866](https://science.nasa.gov/photojournal/global-map-of-plutos-moon-charon/), NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute; unannotated grayscale LORRI mosaic. |
| Io, Europa, Ganymede, Callisto — 1024 px each | NASA/JPL-Caltech and USGS planetary mosaics, [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures), corresponding `Jupiter - …` map directories. Io uses the `(A)` variant. [Europa's source description](https://science.nasa.gov/3d-resources/jupiter-europa/) identifies its Voyager mosaic. |
| Enceladus, Triton, Iapetus — 1024 px each | NASA/JPL-Caltech and USGS / Voyager map products from the same NASA 3D Resources collection, corresponding `Saturn - Enceladus`, `Neptune - Triton`, and `Saturn - Iapetus` directories. These historical mosaics have uneven coverage and resolution. |

Source imagery is compressed for the offline distribution. An overview atlas supplies small bodies in the frame; only one focused map is decoded at full detail. Live focus decoding is capped at 2048 px; paused refinement and Picture studio can use the included 4096 px Earth and Moon products. Actual source resolution is retained in `planet-texture-data.js` metadata. Extra procedural material grain is illustrative and does not claim additional observed geography.

Black unobserved regions of the Pluto, Charon, and Triton maps use neutral illustrative terrain. They are not additional observations. Iapetus's real dark terrain is retained. Saturn's bands and north-polar hexagon, Venus's clouds, Mercury, Uranus, Neptune, Ceres, Vesta, and unmapped minor bodies are procedural illustrations. The Saturn hexagon is a six-sided jet around approximately 78° north, following [Cassini observations](https://science.nasa.gov/photojournal/saturns-north-pole-hot-spot-and-hexagon/). Rings are thin optical-depth sheets, not individually modeled particles. Bilobed shapes are analytic ellipsoid approximations, not mission shape meshes.

The old NASA 3D Resources pre-flyby Pluto/Charon maps were deliberately excluded: those source pages describe invented terrain. The New Horizons maps above provide observed geography instead. No AI-generated surface imagery is included.

[NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) · [NASA 3D Resources collection statement](https://github.com/nasa/NASA-3D-Resources)
