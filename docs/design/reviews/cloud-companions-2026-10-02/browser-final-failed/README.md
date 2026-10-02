# Superseded web image-height regression

This folder preserves the failed first final-export check against
`node_modules/.cache/wq-clouds-final`. It is not final product evidence.

The cloud image source decoded at 1536×512, but react-native-web's visible Image
host retained a 512px intrinsic height at only 128px width. `aspectRatio: 3` alone
did not override that injected height. Contain mode placed the cloud high above
Atlas, visibly on the Home unit card in
[cloud-aspect-diagnostic.png](cloud-aspect-diagnostic.png).

The focused harness stopped on the aspect-ratio assertion before recording any
completed route case. This was confirmed in pixels, not just inferred from a
hidden decoding image's dimensions. Explicit `height: 'auto'` fixes the Image host;
the new immutable export and evidence are under `../browser-final-v2/`.

No part of this was seen on a phone.
