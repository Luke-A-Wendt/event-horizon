# Solar System catalog and visual limits

Snapshot: **25 October 2026**. These files are bundled data; the website does not contact the source services.

The expanded Solar System preset contains **518 selectable entries**: the Sun, eight planets, 24 selected dwarf planets and smaller heliocentric bodies, 461 planetary satellites from JPL's census and Cassini observations, 14 additional satellites of selected small bodies, five ring systems, two statistical belts, an ISS and NASA Shuttle in illustrative Earth orbits, and a fictional Enterprise in lunar orbit. The 461-entry planetary table includes 172 proper names and 289 provisional designations. It covers the Moon, Mars (2), Jupiter (115), Saturn (293), Uranus (29), Neptune (16), and Pluto (5).

This is a broad teaching catalog, **not every object in the Solar System**. It does not instantiate the millions of asteroids/comets individually, every small-body binary, the Oort cloud, or spacecraft. Belt populations are statistical displays. New discoveries after the snapshot are not automatically added.

## Known values and explicitly unknown sizes

- JPL reference radii and gravitational parameters take precedence where available. NASA satellite fact sheets supply many additional estimated radii and approximate triaxial dimensions.
- **232 tiny satellites have no radius in these selected sources.** Their node properties explicitly identify a **1 km illustrative radius** and an illustrative irregular silhouette. Those are visualization proxies, not measurements, and they are not silently presented as known physical dimensions.
- Unknown satellite mass is zero in the visualization, meaning that its gravitational backreaction is neglected. It is not assigned an invented Earth-like mass. Its orbit still responds to the parent.
- Published dimensions of irregular moons and asteroids are reduced to approximate ellipsoids or simplified shape profiles. They are not complete spacecraft-derived shape meshes. The `shapeAxes` entries are semiaxes divided by the reference radius; their longest dimension is therefore physically meaningful.
- Reference maps are used where available; added fine detail and unmapped regions are illustrative. Procedural profiles supply unresolved bodies and changing clouds. They do not reproduce every crater or the current weather. Surface geography on unresolved distant objects is illustrative. See the bundled surface-asset credits for image provenance.
- Sizes of distant bodies, particularly Sedna, Haumea, Makemake, Eris, and minor-body moons, have substantial observational/model uncertainty. These estimates and simplifications are called out in the node's data note.

## Motion and orientation

The mean satellite elements describe orbit size and shape; JPL explicitly says they are **not intended for ephemeris computation**. The display uses approximate parent-relative Kepler motion and illustrative starting phases, not a date-specific prediction. The source frames include ecliptic, equatorial, and local Laplace planes. Equatorial orbits are tilted with their parent; Laplace-plane orientation and absolute pole longitudes remain simplified, and the data note retains the source frame. The four small Pluto moons use approximate circumbinary orbits about the Pluto–Charon barycenter, rather than being carried by Pluto’s wobble. This does not solve their forced oscillations or resonances. There is no full precession, tides, resonance, chaotic rotation, or numerical N-body integration.

The named planets retain NASA's rounded orbital distances and reference dimensions. The extra heliocentric objects use a frozen JPL SBDB orbital snapshot; reference epochs differ. Published sidereal rotation periods are used where available. Eris adopts the approximately 15.79-day synchronized period from 2023 photometry rather than an older short-period SBDB entry. Haumea’s ring is aligned with its equator; the absolute pole direction remains illustrative. Unmeasured small-moon rotation is a schematic twelve-hour period, not a claim about the real object. Many major moons are modeled as tidally locked.

The Solar System around a black hole is fictional. Its Sun is placed at ten million gravitational radii of a 4.3-million-solar-mass black hole. The approximate circular-orbit Hill radius then extends beyond the modeled aphelion of Sedna. This avoids an immediately inconsistent placement; it does not establish long-term dynamical stability.

## Data references

1. [JPL Solar System Dynamics: Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/), snapshot downloaded 25 October 2026. The table has two Puck ephemeris rows; the newer URA184 row is retained, yielding 460 distinct objects. [JPL satellite discovery census](https://ssd.jpl.nasa.gov/sats/discovery.html) supplies a cross-check of names and totals. The missing B-ring moonlet S/2009 S 1 is added from Cassini observations, yielding 461 unique planetary satellites. The census also corrects the mean table's labels `Magaclite` → `Megaclite` and `Philophrosyn` → `Philophrosyne`.
2. [JPL: Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/), same snapshot. Gravitational parameters are converted to mass with `G = 6.67430 × 10⁻¹¹ m³ kg⁻¹ s⁻²`.
3. [JPL: Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html).
4. [NASA NSSDCA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/planetfact.html), including the [Jovian](https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html), [Saturnian](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html), [Uranian](https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html), and [Neptunian](https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptuniansatfact.html) satellite tables. These physical tables are older than the current discovery census and their estimates can differ from newer measurements.
5. [JPL SBDB API](https://ssd-api.jpl.nasa.gov/doc/sbdb.html) and [Small-Body Satellites API](https://ssd-api.jpl.nasa.gov/doc/sb_sat.html): data collected during preparation only; no API is called by the site.
6. [NASA: Makemake](https://science.nasa.gov/dwarf-planets/makemake/) for the estimated 80 km radius and projected separation of MK 2; its complete orbit remains a schematic example.
7. [NASA: Arrokoth facts](https://science.nasa.gov/solar-system/kuiper-belt/arrokoth-2014-mu69/facts/) for the approximate 35 × 20 × 10 km overall dimensions.
8. [Ernst et al. (2023), Phobos and Deimos shape models](https://doi.org/10.1186/s40623-023-01814-7), and [NASA's Phobos overview](https://science.nasa.gov/mars/moons/phobos/).
9. [Pál et al. (2012), Sedna size measurement](https://arxiv.org/abs/1204.0899): adopted diameter 995 km, with reported uncertainty ±80 km.
10. [Brown & Butler (2018), Dysnomia and Vanth sizes](https://doi.org/10.3847/1538-3881/aad9f2); the display adopts approximate radii of 350 km and 237.5 km, respectively.
11. [Ragozzine & Brown (2009), Haumea's moons](https://doi.org/10.1088/0004-6256/137/6/4766) and [Hastings et al. (2016), Hiʻiaka rotation](https://doi.org/10.3847/0004-6256/152/6/195). Satellite sizes are estimates and their trajectories are simplified.
12. [Quaoar size/shape from occultations (2026)](https://arxiv.org/abs/2607.06450), reference diameter 1094.4 km. This differs from older estimates.
13. [NASA: Didymos and Dimorphos](https://science.nasa.gov/solar-system/asteroids/didymos/). The moonlet's size/orbit changed interpretation following DART; the visualization is a rounded present-day teaching model, not a reconstruction of the impact.
14. [NASA PDS: Itokawa target record](https://arcnav.psi.edu/urn%3Anasa%3Apds%3Acontext%3Atarget%3Aasteroid.25143_itokawa), approximate extents 535 × 294 × 209 m.

15. [Cassini: A Small Find Near Equinox](https://science.nasa.gov/photojournal/a-small-find-near-equinox/) and [IAU Circular 9091](https://tamkin3.eps.harvard.edu/iauc/09000/09091.html), for S/2009 S 1. The approximately 150 m radius is inferred from its 300 m vertical extent, assuming the body crosses the ring plane; its width can be greater. Its measured distance is approximately 117,000 km from Saturn. The visualization's circular, coplanar orbit is schematic.

16. [Bernstein et al. (2023), Eris–Dysnomia synchronized rotation](https://arxiv.org/abs/2303.13445), adopting a 15.78590-day period consistent with the companion orbit.
17. [Ortiz et al. (2017), Haumea occultation and ring](https://arxiv.org/abs/2006.03113), for the approximately equatorial ring, 70 km width, and 0.5 optical opacity.

18. [Gakis & Gourgouliatos (2022), Pluto–Charon moon orbits](https://arxiv.org/abs/2202.13319), for the circumbinary interpretation and limits of Keplerian orbital elements.

The catalog itself contains numerical records and references, not downloaded shape meshes. Surface maps are bundled separately with their own attribution. Numerical facts and original procedural implementations remain separate from the source agencies' names and marks.
