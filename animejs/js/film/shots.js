import { anchorRef, track } from "./types.js";

const hold = (value) => track([[0, value], [1, value]]);

export const SHOT_IDS = ["hero", "blueprint", "input", "control", "compute", "final"];

export const shots = [
  { id: "hero", camera: { target: hold(anchorRef("display_center")), azimuth: track([[0, -0.45], [1, 0.45]]), elevation: hold(0.35), radius: track([[0, "fit:2.4"], [1, "fit:2.2"]]), fov: hold(34) }, product: { yaw: track([[0, 0], [1, 0.18]]) }, material: { mode: "pbr" } },
  { id: "blueprint", camera: { target: hold(anchorRef("display_center")), azimuth: track([[0, 0.45], [1, 0.8]]), elevation: track([[0, 0.35], [1, 0.6]]), radius: track([[0, "fit:2.2"], [1, "fit:3.2"]]), fov: hold(34) }, product: { yaw: track([[0, 0.18], [1, 0.32]]) }, parts: [{ system: "enclosure", prop: "posOffset", track: track([[0, [0, 0, 0]], [1, [0, 0, 34]]]) }], material: { mode: "light" } },
  { id: "input", anchor: { use: "keyboard_region", enter: 0.15, exit: 0.85 }, camera: { target: hold(anchorRef("keyboard_center")), azimuth: track([[0, 0.8], [1, 0.55]]), elevation: hold(0.25), radius: track([[0, "fit:2.2"], [1, "fit:1.4"]]), fov: hold(32) }, parts: [{ system: "input", prop: "liftZ", track: track([[0, 0], [0.5, 8], [1, 8]]) }], material: { mode: "ink", focus: { system: "input", blend: track([[0, 0], [0.15, 1], [0.85, 1], [1, 0]]) } } },
  { id: "control", anchor: { use: "knob_axis", enter: 0.15, exit: 0.85 }, camera: { target: hold(anchorRef("knob_axis")), azimuth: track([[0, 0.55], [1, 0.95]]), elevation: track([[0, 0.25], [1, 0.12]]), radius: track([[0, "fit:1.8"], [1, "fit:1.7"]]), fov: hold(32) }, product: { yaw: track([[0, 0.32], [1, 0.8]]) }, material: { mode: "ink", focus: { system: "control", blend: track([[0, 0], [0.15, 1], [0.85, 1], [1, 0]]) } } },
  { id: "compute", anchor: { use: "mainboard_plane", enter: 0.18, exit: 0.82 }, camera: { target: hold(anchorRef("mainboard_center")), azimuth: track([[0, 0.95], [1, 1.3]]), elevation: track([[0, 0.12], [1, 0.5]]), radius: track([[0, "fit:1.8"], [1, "fit:1.35"]]), fov: hold(30) }, parts: [{ system: "compute", prop: "posOffset", track: track([[0, [0, 0, 0]], [0.45, [0, 0, 18]], [1, [0, 0, 18]]]) }, { system: "compute", prop: "rotation", track: track([[0, [0, 0, 0]], [0.55, [-1.36, 0, 0]], [1, [-1.36, 0, 0]]]) }], material: { mode: "ink", focus: { system: "compute", blend: track([[0, 0], [0.15, 1], [0.85, 1], [1, 0]]) } } },
  { id: "final", camera: { target: hold(anchorRef("display_center")), azimuth: track([[0, 1.3], [1, 0.1]]), elevation: track([[0, 0.5], [1, 0.35]]), radius: track([[0, "fit:3"], [1, "fit:2.2"]]), fov: hold(34) }, product: { yaw: track([[0, 0.8], [1, 0.18]]) }, material: { mode: "pbr" } },
];
