# Architecture

## Preserved behavior

The 120 Hz simulation, four motion selections, approximate hand-contact calibration, and three practice modes are preserved. Physics and animation use the same clock. No floor circle is required for a hit. The game uses a tolerant reach volume rather than a rigid paddle collision solver.

The shot solver now increases flight duration to clear the net while retaining the selected landing point. It no longer silently raises only vertical speed and moves the target beyond the player's aim.

## Rendering

The athlete is an original one-time procedural mesh build, not frame-by-frame shape regeneration. Cloth/body surfaces avoid duplicated covered skin. Shoulder vertices blend across clavicle and upper arm. All 18 recorded joints retain their original names and layout; the racket remains parented to the dominant wrist.

Most static venue meshes are merged by material; vegetation uses instances. The renderer has a capped pixel ratio, selectable shadow resolution, format-aware MSAA support, and an RGBA8 fallback when floating-point render targets are unavailable. Actual quality changes dispose/recreate render targets and shadow maps rather than retaining old GPU objects.

## Replay and modal state

Replay records a bounded rolling buffer of poses, transforms and ball positions. Playing a saved shot never advances live gameplay. Exit restores the exact saved pose and live ball state. Game controls are blocked during replay.

Each dialog saves its own prior pause state. Close/cancel restores immediately and idempotently, preventing a delayed native close event from corrupting a later dialog's pause state. Endurance exhaustion is terminal until restart, even when P is pressed.

## Offline boundary

All code and source-derived motion are embedded in the HTML. Textures are generated locally on canvas. There are no remote fonts, trackers, online asset fallbacks, or runtime fetch calls. CSP blocks outbound connections. Settings use localStorage with safe error handling; audio starts only after user interaction. Optional source downloads and dependency installation belong to explicit development commands, never the running game.

## Scope

This is a one-player tennis practice game. It does not claim an AI opponent, tournament/online system, full mocap library, cloth simulation, solved foot locking, or a perfect biomechanical contact solver. The accompanying browser tests protect the implemented scope rather than checking boxes for absent features.
