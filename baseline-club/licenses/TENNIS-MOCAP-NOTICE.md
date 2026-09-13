# Tennis-MoCap: recovery package supplement

The original in-game attribution is preserved verbatim in ORIGINAL-ABOUT-NOTICE-1.txt and the HTML About page.

Source: https://github.com/jdpulgarin/Tennis-MoCap
Pinned upstream revision: 9af88bb4df4e78b22127719744fdca993ced2733
License: CC BY-SA 3.0 Unported
Legal code: https://creativecommons.org/licenses/by-sa/3.0/legalcode

Pulgarin-Giraldo J.D., Alvarez-Meza A.M., Melo-Betancourt L.G., Ramos-Bermudez S., Castellanos-Dominguez G.
A Similarity Indicator for Differentiating Kinematic Performance Between Qualified Tennis Players.
LNCS 10125, pp. 309–317, 2017. DOI: 10.1007/978-3-319-52277-7_38.

This recovery contains six raw BVH recordings under assets-source/full, not merely the old 11/7 pose excerpts.
The runtime uses six cropped 50Hz clips extracted earlier from these 100Hz sources, plus reach/slice derivatives.
Coordinate normalization, scaling, retargeting, runtime hand correction, time adaptation and foot-floor alignment are adaptations, not original dataset results.
Derived motion/rig data keep the applicable ShareAlike and attribution terms; separate original application code is MIT. No author endorsement is implied.

The forehand raw file declares 479 frames but contains 480 motion rows; bytes are deliberately preserved. Review the import policy before re-baking.
