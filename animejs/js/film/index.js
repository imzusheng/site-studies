import { computeAnchors } from "./anchors.js";
import { evaluateFilm, evaluateShot } from "./evaluate.js";
import { shots, SHOT_IDS } from "./shots.js";

export const ProductFilm = { shots, SHOT_IDS };
export { computeAnchors, evaluateFilm, evaluateShot };
