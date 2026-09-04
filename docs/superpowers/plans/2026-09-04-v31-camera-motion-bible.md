# Luma Remote A3.40 — Camera Bible + Motion Bible

**Status:** FROZEN DIRECTORIAL SPEC
**Scope:** v31 product-film direction only. No geometry, manifest, interaction-model, or rendering-pipeline redesign.
**Supersedes:** the 6-shot/9-beat directing plan in `2026-09-04-v31-product-film-architecture.md` §4 and the current camera/object tracks in `animejs/js/film.js`.
**Preserves:** A3.40 profile, Anime.js scroll timeline, Three.js scene/model loader, current real-LCD projection geometry, and Issue #26 LCD interaction semantics.

## 1. Directorial decision

This film is one product inspection, not a sequence of feature sections and not a drone orbit around a CAD model.

The spatial story is:

`whole product → LCD datum → engineering separation → input → control → display → compute → LCD-normal exit → whole product`

Every shot must advance that story. A shot may not exist only to show another angle.

### Frozen invariants

```yaml
Camera rotation: CLOCKWISE ONLY
Animated camera reversals: FORBIDDEN
Orbit angle representation: UNWRAPPED DEGREES
Orbit journey: 20deg -> 45deg -> 75deg -> 100deg -> 130deg -> 150deg -> 160deg
Orbit holds: ALLOWED
Camera orbital center: IMMUTABLE LCD DATUM AT ASSEMBLED POSITION
Feature framing: SCREEN-SPACE OFFSET; NEVER RETARGET THE ORBIT CENTER
Product counter-rotation: FORBIDDEN
Explosion: ONE GLOBAL EVENT, SHOT 05 ONLY
Return: OUTWARD, LCD-NORMAL-DOMINANT; NEVER REVERSE THE ORBIT
Editorial cuts: ONE MAXIMUM, COVERED BY BLACK, AFTER THE ORBIT HAS STOPPED
```

Increasing `cameraAzimuth` must be calibrated once to read as clockwise in the rendered view. From then on the stored angle is unwrapped and may hold or increase; it may never decrease. A `359 → 0` wrap is not permitted inside an animated segment.

### Important implementation boundary

The current engine derives `point('display')` from the transformed LCD mesh, so that target moves when the LCD explodes. That cannot satisfy an immutable LCD datum through changes in `film.js` alone.

The implementation therefore needs one narrow support change: expose `lcdDatumHome`, computed before part animation, and use it as the orbital center for the full film. This is not a new camera architecture. All shot choreography remains in `film.js`.

## 2. Coordinate and framing contract

- `azimuth`: unwrapped degrees around product-local `+Z`; increasing values render clockwise.
- `elevation`: degrees above the product-local XY plane.
- `radiusScale`: camera distance divided by the existing fitted `baseRadius`.
- `fov`: vertical field of view in degrees.
- `LCD local Z`: the existing `FACE_NORMAL`, not world Z. All exploded offsets and LCD-normal return motion use this axis.
- `framing`: a screen-space composition offset. It may place a feature off-center without changing the orbit center.

The orbit center and look datum remain `lcdDatumHome`. Feature compositions are derived at runtime:

```yaml
whole:       LCD datum at 52% viewport width, 47% viewport height
lcd:         LCD visible quad center at 50%, 50%
keycap:      selected center key at 43%, 54%
knob+lcd:    midpoint(knob axis, LCD center) at 50%, 52%
compute:     mainboard center at 52%, 49%
```

These are composition goals, not alternate camera targets.

## 3. The 12-shot camera journey

The percentages are the source of truth. Milliseconds are the equivalent values for the current `TOTAL_TIME = 17000` timeline.

| # | Shot | Range | Timeline | Azimuth | Elevation | Radius | FOV | Camera purpose |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 01 | DARK PRODUCT REVEAL | 0–8% | 0–1360 | 20 hold | 15 hold | 1.30→1.18 | 34 | Establish one physical object; slow reveal dolly only |
| 02 | HERO ORBIT | 8–18% | 1360–3060 | 20→45 | 15→18 | 1.18→1.10 | 34→33 | First and clearest clockwise orbit; keep the full product visible |
| 03 | LCD DATUM | 18–27% | 3060–4590 | 45 hold | 18→24 | 1.10→0.94 | 33→31 | Move attention to the real LCD plane without creating a HUD |
| 04 | BLUEPRINT TRANSITION | 27–38% | 4590–6460 | 45 hold | 24→30 | 0.94→1.24 | 31→34 | Let material language change while orbit direction rests |
| 05 | BLUEPRINT EXPLODE | 38–50% | 6460–8500 | 45 hold | 30→32 | 1.24→1.38 | 34 hold | Reveal the system once; distance only compensates for new bounds |
| 06 | ENTER INPUT | 50–58% | 8500–9860 | 45→75 | 32→24 | 1.38→0.74 | 34→30 | Travel through the space created by the explosion into the key region |
| 07 | KEYCAP MACRO | 58–66% | 9860–11220 | 75 hold | 24→20 | 0.74→0.54 | 30→27 | First macro inspection; selected key leads, neighbors support |
| 08 | CONTROL TRANSITION | 66–74% | 11220–12580 | 75→100 | 20→18 | 0.54→0.60 | 27→28 | Continue clockwise from input to the knob/LCD relationship |
| 09 | DISPLAY CLOSEUP | 74–82% | 12580–13940 | 100 hold | 18 hold | 0.60 hold | 28 hold | Lock the camera; the LCD and knob carry the scene |
| 10 | COMPUTE ENTRY | 82–90% | 13940–15300 | 100→130 | 18→31 | 0.60→0.84 | 28→30 | Continue around the rear while the service cover opens |
| 11 | PCB INSPECTION | 90–96% | 15300–16320 | 130→150 | 31→38 | 0.84→0.62 | 30→27 | Camera orbit and PCB turn share one clockwise screen direction |
| 12 | RETURN | 96–100% | 16320–17000 | 150→160, stop | 38→70 | 0.62→1.15 | 27→34 | Reassemble while exiting along the LCD normal; finish on the whole object |

The camera values are frozen starting values for implementation. Composition acceptance takes priority over blindly preserving a radius number, but any correction must keep the azimuth chain and shot purpose unchanged.

## 4. Shot Bible

Every shot has an entry, an inspection, and an exit. “Hold” is an intentional camera state, not missing direction.

### Shot 01 — DARK PRODUCT REVEAL

- **Entry:** near-black frame; product silhouette is already present, not spawned.
- **Inspection:** a slow radius-only push reveals enclosure outline, LCD glass, knob, then keycaps.
- **Exit:** the full product remains contained with breathing room for Shot 02.
- **Scene motion:** none.
- **LCD:** Issue #26 Home — `灯光 / 客厅主灯 / 72%`, footer `3800K · 阅读`, sync `已同步`.
- **Material:** 70% dark PBR, 30% edge; reduced saturation and exposure.
- **Forbidden:** orbit, exploded parts, feature labels, floating stage frame.

### Shot 02 — HERO ORBIT

- **Entry:** inherit Shot 01 position and velocity.
- **Inspection:** one clockwise move `20→45`; LCD, keycaps, and knob remain readable as a single control surface.
- **Exit:** settle at 45 degrees before optical projection begins.
- **Scene motion:** no product yaw/pitch counter-motion.
- **LCD:** Home state holds.
- **Forbidden:** changing orbit sign, cropping the chassis, simultaneous object animation.

### Shot 03 — LCD DATUM

- **Entry:** camera leaves the orbit at zero angular velocity and performs a meaningful inspection dolly.
- **Inspection:** project the real four LCD corners; expand them 10% about their centroid to create the optical aperture.
- **Exit:** the aperture is ready to become the blueprint viewport.
- **Scene motion:** none.
- **LCD:** Home state remains real and legible; no generic film telemetry.
- **Forbidden:** a free-floating rectangular overlay, center target dot, unrelated HUD frame.

### Shot 04 — BLUEPRINT TRANSITION

- **Entry:** inherit the LCD-derived aperture.
- **Inspection:** transition in this strict order:
  1. edge-line opacity rises;
  2. solid material opacity and saturation fall;
  3. background crosses from dark to engineering paper.
- **Exit:** engineering mode is established before any part separates.
- **Scene motion:** no explosion yet.
- **Forbidden:** instant PBR→white switch, orbiting during the material change, more than five callouts.

### Shot 05 — BLUEPRINT EXPLODE

- **Entry:** whole product remains spatially legible in engineering mode.
- **Inspection:** run the film's only global explode action along product-local LCD normal.
- **Exit:** exploded state reaches 1 and remains there through Shot 11.
- **Camera:** distance grows only enough to contain the new bounds.
- **Forbidden:** manifest explode vectors, lateral scatter, internal parts lower than the shell, LCD hidden by the upper shell.

### Shot 06 — ENTER INPUT

- **Entry:** global explosion stays at 1; do not reassemble.
- **Inspection:** resume clockwise orbit `45→75` and use the opened volume as the path into the key zone.
- **Exit:** selected center key is compositionally dominant before it moves.
- **LCD:** Home state; no unrelated screen animation.
- **Forbidden:** second explode, direct target switch to `keyboard_center`, all keys moving together.

### Shot 07 — KEYCAP MACRO

- **Entry:** camera angular velocity reaches zero before key motion begins.
- **Inspection:** selected center key rises `0→8 mm`; the other five keys rise only `0→2 mm` with center-out stagger.
- **Exit:** hold long enough to read the exposed switch, then keep the global explosion intact.
- **Material:** INK mode.
- **Optional LCD response:** a brief Issue #26 preset toast from the selected physical key; return to Home before Shot 08.
- **Forbidden:** six equal jumps, bouncing, keycaps leaving their switch axes, another camera orbit during the lift.

### Shot 08 — CONTROL TRANSITION

- **Entry:** selected key motion settles before the orbit resumes.
- **Inspection:** clockwise `75→100`; screen-space framing transfers from keycap to the knob/LCD midpoint.
- **Exit:** the final camera state shows both the physical knob and readable LCD.
- **LCD:** switch to Issue #26 Detail for `客厅主灯`.
- **Forbidden:** direct cut, reverse orbit, generic `LUMA / CONTROL` UI.

### Shot 09 — DISPLAY CLOSEUP

- **Entry:** camera is fully stopped.
- **Inspection:** camera remains locked while the knob rotates 0.5 turn and the actual Detail UI changes:
  - `亮度 72%` changes with the orange slider;
  - `色温 3800K` remains visible;
  - `效果 阅读` remains visible.
- **Exit:** knob and UI settle before compute travel begins.
- **Forbidden:** camera drift, circular demo gauge, numeric-only UI, page animation unrelated to knob input.

### Shot 10 — COMPUTE ENTRY

- **Entry:** camera leaves the display hold clockwise `100→130`.
- **Inspection:** travel to the rear; open the service cover on its real hinge/normal relationship.
- **Exit:** board is visible in context, but it has not flown toward camera.
- **LCD:** enter a film state derived from Issue #26 system/sync language: `ESP32-S3 / SYNC / ONLINE` using the same dark surface, status dot, typography, and accent tokens.
- **Forbidden:** global re-explode, PCB translation toward the lens, opaque shell blocking the board.

### Shot 11 — PCB INSPECTION

- **Entry:** PCB position is inherited from Shot 05's single global separation.
- **Inspection:** orbit `130→150` while the PCB flips in place around its local long edge; its on-screen turn is clockwise, matching the camera.
- **Exit:** stop both motions with the board readable and spatially attached to the product.
- **Material:** INK with PCB at full opacity and a restrained orange inspection accent.
- **Forbidden:** PCB fly-out, camera reversal, camera and PCB rotating against each other, blown-out white board.

### Shot 12 — RETURN

- **Entry:** internal view, orbit still at 150 degrees.
- **Inspection:** continue to 160 degrees while elevation and radius create an outward path dominated by the LCD face normal. Reassembly occurs from inner systems to shell as the camera passes back through the object envelope.
- **Exit:** full product is visible and the camera stops before any black frame.
- **LCD:** Issue #26 Presets — `日常 / 氛围 / 睡眠` visible; no invented demo page.
- **End punctuation:** hold whole product, fade to black, then allow at most one declared cut under full black to a static Shot 01 hero end card. The cut is not an animated reversal.
- **Forbidden:** rewinding the orbit, reverse playback of the film, ending on the PCB, cutting while camera is moving.

## 5. LCD optical projection contract

The presentation frame is an optical consequence of the physical screen.

1. Read the current projected LCD quad `q0..q3` from the real mesh.
2. Compute centroid `c`.
3. Compute the aperture `qi' = c + 1.10 * (qi - c)`.
4. Animate corresponding corners from `qi'` to the blueprint safe frame; do not replace the quad with an unrelated rectangle.
5. Add a restrained matte/optical wash inside the aperture so it reads as a projected viewport, not a wireframe HUD.
6. Preserve the LCD plane perspective until the blueprint state is established.
7. Remove the current origin dot and generic telemetry.

The viewport may contain at most five engineering labels. Leader lines originate from real semantic anchors, exit the product silhouette before changing direction, and never cross the product body.

## 6. Motion Bible

### 6.1 Choreography rule

Every shot follows:

`entry → settle → subject action/inspection → settle → exit`

- Camera leads into a subject.
- Subject acts only after the camera has substantially settled.
- Camera exits only after the subject action is readable.
- Two major motions may overlap only when their shared direction is the point of the shot: Shot 11 camera orbit + PCB flip.
- Copy/UI transitions may overlap physical motion, but may not be the only evidence that a new shot has started.

### 6.2 Camera motion

- All angular segments use monotonic easing with zero slope at intentional holds.
- Holds between orbit segments are 8–15% of the local shot duration, except the fully locked Shot 09.
- No decorative breathing zoom.
- Radius changes are allowed only for reveal, inspection coverage, or return.
- FOV changes stay within `27–34deg`; use dolly before FOV to change scale.
- Product transform remains fixed during the orbital journey. Do not hide camera errors with counter-yaw.

### 6.3 Global explosion

The explode axis is product-local LCD normal. Layer numbers define reveal/opacity priority; offsets define physical separation.

| Layer | System | Nominal offset | Opacity at full explode | Scale |
|---:|---|---:|---:|---:|
| 0 | upper shell | +40 mm | 0.80 | 1.00 |
| 1 | bezel | +48 mm | 0.84 | 1.00 |
| 2 | LCD/display | +60 mm | 1.00 | 1.03 |
| 3 | keyboard/keycaps | +55 mm | 1.00 | 1.03 |
| 4 | switches | +64 mm | 0.94 | 1.03 |
| 5 | PCB/mainboard | +70 mm | 1.00 | 1.03 |
| 6 | electronics/retainer | +78 mm | 0.96 | 1.03 |
| — | EC11 control stack | +50 mm | 1.00 | 1.03 |

Nominal offsets are minimums. At runtime, each system must satisfy:

```text
clearanceAlongNormal > relevantBoundingBoxThickness * 1.20
internalOffset > shellOffset
```

If a nominal offset fails either test, increase that system's offset; never reduce another layer or add lateral drift. The LCD and PCB must remain unobstructed at Shot 05's accepted camera view.

### 6.4 Key motion

```yaml
selected key:
  lift: 0 -> 8mm
  easing: out(3)
other keys:
  lift: 0 -> 2mm
  easing: out(3)
stagger:
  order: center-out
  delay: 70-100ms virtual timeline equivalent
return before Shot 08: optional only if it does not read as a second explosion
```

### 6.5 Rotary motion

- Knob remains mechanically attached.
- Rotation is exactly `0.5 turn` during Shot 09.
- UI value change is phase-locked to knob angle, not to shot progress independently.
- No axial knob lift unless required to expose the EC11 in Shot 05; any reveal is owned by the single global explosion.

### 6.6 PCB motion

- PCB translation is established by Shot 05 and held.
- Shot 10 opens the service cover; it does not launch the PCB.
- Shot 11 rotates the PCB in place around a mechanically plausible local long edge.
- PCB screen-space rotation sign matches clockwise camera travel.
- Return rotation finishes before the final shell closure.

### 6.7 Reassembly order

During Shot 12, collapse in this order:

`electronics → PCB → switches → keyboard → LCD → bezel → EC11 → shell`

The camera must already be moving outward. Reassembly may not start by reversing the Shot 05 camera path.

## 7. Visual Bible

```yaml
Hero:
  background: "#090a0d"
  material: "70% dark PBR / 30% edge"
  saturation: reduced
  lighting: silhouette rim + restrained LCD emission

Engineering:
  material: "20% solid / 80% line"
  requirements: "EdgesGeometry + AO + soft shadow"
  color: warm paper and neutral ink
  forbidden: saturated blue PCB dominance

Macro:
  mode: INK
  background: "#090a0d"
  line: "#d8d8d0"
  accent: "#f3a93c"
  lighting: industrial scan, not glossy product viewer
```

Material transitions are shot actions with an ordered beginning and end. They may not be driven by the current section name as an instantaneous style switch.

## 8. Implementation mapping

Keep the existing runtime structure. Rewrite the director tracks and LCD drawing states.

### Keep

- `TOTAL_TIME = 17000`
- Anime.js scroll timeline
- `evaluateMotion(time)` pure evaluation
- A3.40 profile and semantic role mapping
- current Three.js renderer, mesh loading, and LCD quad projection
- current DOM/UI update loop

### Rewrite in `film.js`

- replace 9 `BEAT_RANGES` with the 12 frozen ranges above;
- replace all camera tracks with the monotonic chain;
- remove focus handoffs as camera targets; feature emphasis becomes screen-space framing;
- freeze product yaw/pitch/roll during the orbit;
- replace one scalar explode behavior with the frozen per-system layer table;
- change keycap motion to selected `8 mm` + neighbors `2 mm` center-out stagger;
- keep global explode at 1 from Shot 05 exit through Shot 11;
- choreograph service cover and PCB actions without a second fly-out;
- drive explicit LCD state and knob-linked values.

### Narrow support changes outside `film.js`

- expose immutable `lcdDatumHome` in `film-engine.js`;
- render Issue #26 Home, Detail, System/Sync, and Presets states on the existing 640×480 LCD canvas;
- make part explosion offsets consume the per-system table along `FACE_NORMAL`;
- remove the projection origin dot and generic LCD telemetry.

Do not refactor model loading, renderer setup, or the timeline architecture during this pass.

## 9. Acceptance gates

### Camera

- For every sampled animated frame before the black-covered cut: `deltaAzimuth >= -0.05deg`.
- The only permitted negative azimuth discontinuity is the declared static end-card cut under full black.
- Shot boundary position discontinuity `< 0.005 * baseRadius`; look-direction discontinuity `< 0.5deg`, excluding the declared cut.
- Shot 09 camera position, FOV, framing, and look direction are constant.
- Shot 12 outward displacement has `dot(normalized(displacement), FACE_NORMAL) >= 0.80`.
- Whole product stays inside the safe frame in Shots 01, 02, 05 exit, and 12 exit.

### Motion

- Exactly one global explosion rise exists.
- Global explosion remains fully open from Shot 05 exit to Shot 11 exit.
- No keycap exceeds 8 mm; non-selected keycaps do not exceed 2 mm.
- Knob rotates 0.5 turn and remains attached.
- PCB has no independent camera-facing translation in Shots 10–11.
- Reassembly order matches §6.7.

### Visual and LCD

- PBR→engineering transition order is edge, fill, background.
- Engineering view is visibly line-dominant; macro is INK.
- LCD frame can be traced back to the four real projected LCD corners.
- No `LUMA / CONTROL`, circular demo gauge, `18`, or `92` remains.
- Home, Detail, System/Sync, and Presets reuse the Issue #26 content and tokens.
- Final accepted frame is a complete product, never a PCB or exploded closeup.

### Shot health checklist

| Shot | Entry | Inspection | Exit | Frozen health target |
|---|---|---|---|---|
| 01 | silhouette | reveal dolly | whole product | complete object understood |
| 02 | inherit | clockwise hero orbit | settle at 45 | controls legible together |
| 03 | inherit | LCD aperture | viewport ready | frame has physical origin |
| 04 | aperture | material conversion | engineering state | no white flash |
| 05 | whole | one explode | open hold | layers unobstructed |
| 06 | open hold | orbit into keys | key framed | no reassembly |
| 07 | camera settle | center key lift | switch readable | no six-key jump |
| 08 | key settle | orbit to knob | knob+LCD framed | no target snap |
| 09 | camera lock | UI + 0.5 turn | response settled | no camera drift |
| 10 | leave hold | rear entry + cover | board in context | no PCB fly-out |
| 11 | inherit | orbit + in-place flip | readable board | same-direction motion |
| 12 | internal | normal-dominant exit + reassembly | whole product stop | black only after stop |

## 10. Evidence and known limits

Current localhost states were inspected at `#hero`, `#blueprint`, `#input`, `#control`, `#compute`, and the final scroll position. They confirm:

- the current azimuth chain reverses (`24→40→-14→58→30`);
- each feature restarts framing through focus-weight handoffs;
- the current LCD is generic telemetry rather than Issue #26 UI;
- the final frame remains a large blue PCB closeup instead of a return to the object.

This document freezes direction and measurable motion behavior. Visual acceptance still requires a fresh browser pass after implementation at the same viewport; static checks cannot prove photographic composition or perceived clockwise direction.
