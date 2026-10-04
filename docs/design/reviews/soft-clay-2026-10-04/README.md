# Softer clay edges

The shared material previously stacked concentrated inset shading over a short,
strong outer shadow. The result was a hard contact stripe on pale surfaces.
Inset lighting now spreads over 16 points with a 1-point offset; ice highlight and
shade opacity are reduced. Shared outer elevation uses a 12-point blur, 11% opacity
and a 2-point offset. Semantic answer and keyboard-focus borders are unchanged.

Quests before/after captures show less pronounced lower edges on cards, tabs and
navigation. Light-theme captures at 320, 390, 430 and 768 passed the existing
layout measurements. Design typecheck, all 49 design tests and contrast checks
passed. No layout or interaction behavior changed.

These are exported-app browser captures. Native iOS shadow rasterization still
needs device review; this change is not in TestFlight build 20. No part of this
review was seen on a phone.
