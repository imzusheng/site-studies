// Stable scenic positions around the central board. Bonded / molded subparts
// share one transform; only the source's separable switch pieces travel alone.
export function stageDetails(parts, stageGroup) {
  const all = [...parts.values()];
  const pick = ids => ids.map(id => parts.get(id)).filter(Boolean);
  const switchPlaces = [
    [-182, 107, -57], [148, 98, -36], [-148, -20, -62],
    [150, -72, -52], [-24, -147, 28], [62, 146, -32],
  ];
  switchPlaces.forEach((place, i) => {
    const prefix = `choc_v2_${i + 1}_`;
    const separate = ['top_housing', 'stem', 'spring', 'active_button'];
    const side = place[0] < 0 ? -1 : 1;
    const angles = [.18 + i * .11, -.35 + i * .12, -.6 + i * .27];
    const lane = [side * (235 + i * 13), (i - 2.5) * 48, 110 + i * 17];
    stageGroup(all.filter(p => p.id.startsWith(prefix) && !separate.some(s => p.id === prefix + s)), place, angles, lane);
    const offsets = [[side * 19, 14, 18], [-side * 8, 31, -8], [side * 25, -17, 7], [-side * 19, -13, 22]];
    separate.forEach((name, j) => {
      const offset = offsets[(j + i) % offsets.length];
      stageGroup(pick([prefix + name]), place.map((v, k) => v + offset[k]),
        [angles[0] + .13 * (j + 1), angles[1] - .17 * j, angles[2] + .23 * (j - 1)],
        [lane[0] + side * j * 18, lane[1] + j * 17, lane[2] + j * 21]);
    });
  });

  // Twelve optical bodies; the active-area mask remains attached to cover glass.
  // Irregular positions and independent orientations replace the parallel stack.
  const optics = [
    ['lcd_rear_frame', [184, 12, 104], [.15, .45, -.4]],
    ['lcd_reflector', [226, 42, 130], [-.28, .18, .25]],
    ['lcd_light_guide', [170, 70, 148], [.38, -.21, -.55]],
    ['lcd_diffuser', [238, -12, 156], [-.18, .62, .12]],
    ['lcd_prism_lower', [200, -50, 118], [.45, .1, -.72]],
    ['lcd_prism_upper', [256, 61, 99], [-.35, -.15, .4]],
    ['lcd_rear_polarizer', [153, 35, 179], [.22, .52, -.18]],
    ['lcd_tft_lower_glass', [228, 91, 175], [-.4, .32, .64]],
    ['lcd_cell_gap', [274, 13, 196], [.55, -.23, -.36]],
    ['lcd_color_filter_glass', [179, -34, 196], [-.15, .7, .35]],
    ['lcd_front_polarizer', [252, -62, 163], [.32, -.4, -.6]],
    ['lcd_front_cover_glass', [211, 17, 219], [.15, .45, -.4]],
  ];
  optics.forEach(([id, position, angles], i) => {
    const ids = id === 'lcd_front_cover_glass' ? [id, 'lcd_black_mask'] : [id];
    stageGroup(pick(ids), position, angles, [220 + i * 13, (i % 3 - 1) * 38, 30 + i * 11]);
  });
  stageGroup(all.filter(p => p.id.startsWith('lcd_fpc_')), [289, -36, 128], [.2, -.3, .6], [390, -100, 20]);
  stageGroup(all.filter(p => p.id.startsWith('lcd_backlight_led')), [280, 91, 143], [-.2, .5, -.35], [410, 110, 40]);
}
