// Formal A3.44 Physical Twin. Object IDs follow the source manifest exactly.
// Vendor STEP objects have no verified chip-level semantic mapping: do not infer
// CPU/flash/IMU labels from geometry or substitute the previous proxy meshes.
export const A344_PROFILE = Object.freeze({
  id: 'industrial_a3_44',
  revision: 'A3.44_MODEL_REFINEMENT',
  label: 'A3.44 / ALL-IN-ONE CONTROL',
  source: 'luma-remote / formal A3.44 physical twin',
  manifestUrl: '/models/a344/ASSEMBLY_MANIFEST.json',
  dimensions: Object.freeze({
    width: 120,
    depth: 81,
    frontHeight: 17.6,
    backHeight: 30.5,
    screenCenter: [0, 14],
    displayVisible: [40.8, 30.6],
    keyPitch: 19.5,
    keyCenters: [[-43, 16.5], [43, 16.5], [-43, -3], [43, -3], [-43, -22.5], [43, -22.5]],
    knobCenter: [0, -22.5],
    knobWellDiameter: 26,
    knobOuterDiameter: 22.5,
    faceAngleDeg: Math.atan(12.9 / 81) * 180 / Math.PI,
    printablePartCount: 11,
  }),
  roles: Object.freeze({
    upperShell: 'cosmetic_upper_shell',
    serviceCover: 'bottom_service_cover_battery_cradle',
    screenBezel: 'screen_bezel',
    retainer: 'esp32_m3_retainer',
    displayModule: 'lcd_rear_frame',
    activeGlass: 'lcd_front_cover_glass',
    mainboard: 'waveshare_vendor_solid_001_59d126fe',
    knob: 'ec11_knob_22p5',
    encoder: 'ec11_metal_can',
    keycapFocus: 'keycap_2',
    keycaps: ['keycap_1', 'keycap_2', 'keycap_3', 'keycap_4', 'keycap_5', 'keycap_6'],
    switches: Array.from({ length: 6 }, (_, i) => `choc_v2_${i + 1}_top_housing`),
    switchStems: Array.from({ length: 6 }, (_, i) => `choc_v2_${i + 1}_stem`),
    switchSprings: Array.from({ length: 6 }, (_, i) => `choc_v2_${i + 1}_spring`),
    lipo: 'battery_503450_pouch',
    powerBoard: 'battery_503450_pcm',
    batteryHeader: 'battery_mx125_housing',
    printable: [
      'cosmetic_upper_shell', 'bottom_service_cover_battery_cradle', 'screen_bezel', 'esp32_m3_retainer',
      'ec11_knob_22p5', 'keycap_1', 'keycap_2', 'keycap_3', 'keycap_4', 'keycap_5', 'keycap_6',
    ],
  }),
});

// Existing UI/film modules can migrate independently without retaining old assets.
export const A340_PROFILE = A344_PROFILE;

export const roleId = (role) => {
  const value = A344_PROFILE.roles[role];
  return Array.isArray(value) ? value[0] : value;
};

export const roleIds = (role) => {
  const value = A344_PROFILE.roles[role];
  if (!value) return [];
  return Array.isArray(value) ? [...value] : [value];
};
