export const A340_PROFILE = Object.freeze({
  id: 'industrial_a3_40',
  revision: 'A3.40_EC11_BEZEL_CLEARANCE',
  label: 'A3.40 / EC11-CLEARANCE / TRI3',
  source: 'luma-remote PR #31 / merge 48bd3ea',
  dimensions: Object.freeze({
    width: 120,
    depth: 81,
    frontHeight: 15.5,
    backHeight: 28.4,
    screenCenter: [0, 14],
    displayVisible: [41.4, 31.2],
    keyPitch: 19.5,
    knobCenter: [0, -19.5],
    knobWellDiameter: 26,
    knobOuterDiameter: 24,
    faceAngleDeg: 9.049,
  }),
  roles: Object.freeze({
    upperShell: 'cosmetic_upper_shell',
    serviceCover: 'bottom_service_cover',
    screenBezel: 'screen_bezel',
    displayModule: 'waveshare_esp32_s3_lcd_2',
    mainboard: 'waveshare_esp32_s3_lcd_2',
    retainer: 'esp32_m3_retainer',
    knob: 'ec11_knob_26x8p5',
    encoder: 'ec11_encoder_body_15mm_d_shaft',
    knobHardware: ['ec11_encoder_body_15mm_d_shaft', 'ec11_mounting_washer', 'ec11_mounting_nut'],
    keycapFocus: 'keycap_2',
    keycaps: ['keycap_1', 'keycap_2', 'keycap_3', 'keycap_4', 'keycap_5', 'keycap_6'],
    switches: ['choc_v2_1', 'choc_v2_2', 'choc_v2_3', 'choc_v2_4', 'choc_v2_5', 'choc_v2_6'],
  }),
  // PR #31 intentionally does not commit the generated 231 loose STL files.
  // The site keeps the committed exact A3.32 web bundle and applies the visible
  // A3.40 delta at one profile boundary: Ø30→Ø26 cosmetic well, Ø26→Ø24 knob,
  // and the PR #30 17×15×5 mm body + 3.3 mm socket-boss keycap silhouette.
  webAdaptation: Object.freeze({
    knobScaleXY: 24 / 26,
    wellOuterRadius: 15,
    wellInnerRadius: 13,
    keycapTarget: [17, 15, 8.3],
  }),
});

export const roleId = (role) => {
  const value = A340_PROFILE.roles[role];
  return Array.isArray(value) ? value[0] : value;
};

export const roleIds = (role) => {
  const value = A340_PROFILE.roles[role];
  if (!value) return [];
  return Array.isArray(value) ? [...value] : [value];
};
