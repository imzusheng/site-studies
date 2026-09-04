export const A340_PROFILE = Object.freeze({
  id: 'industrial_a3_40',
  revision: 'A3.40_EC11_BEZEL_CLEARANCE',
  label: 'A3.40 / ALL-IN-ONE CONTROL',
  source: 'luma-remote / A3.40 presentation source',
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
    sceneObjectCount: 231,
    printablePartCount: 11,
  }),
  roles: Object.freeze({
    upperShell: 'cosmetic_upper_shell',
    serviceCover: 'bottom_service_cover',
    screenBezel: 'screen_bezel',
    retainer: 'esp32_m3_retainer',
    displayModule: 'lcd_backlight_stack',
    activeGlass: 'lcd_active_glass',
    mainboard: 'compute_pcb',
    cpu: 'compute_u2',
    flash: 'compute_u5',
    imu: 'compute_u3',
    usb: 'compute_usb_c',
    microsd: 'compute_microsd',
    cameraFpc: 'compute_camera_fpc',
    batteryHeader: 'compute_battery_jst',
    knob: 'ec11_knob_24x8p5',
    encoder: 'ec11_reference',
    keycapFocus: 'keycap_2',
    keycaps: ['keycap_1', 'keycap_2', 'keycap_3', 'keycap_4', 'keycap_5', 'keycap_6'],
    switches: ['choc_v2_1', 'choc_v2_2', 'choc_v2_3', 'choc_v2_4', 'choc_v2_5', 'choc_v2_6'],
    inputBoards: ['input_pcb_left', 'input_pcb_right'],
    lipo: 'lipo_cell',
    powerBoard: 'power_pcb',
    printable: [
      'cosmetic_upper_shell', 'bottom_service_cover', 'screen_bezel', 'esp32_m3_retainer',
      'ec11_knob_24x8p5', 'keycap_1', 'keycap_2', 'keycap_3', 'keycap_4', 'keycap_5', 'keycap_6',
    ],
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
