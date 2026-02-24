#!/bin/bash

# Here we patch up the dependencies that need to be tweaked to work with our build system after installed

# Per https://github.com/visgl/deck.gl/issues/7735, @mapbox/tiny-sdf is a ESM that we need to transpile
# and consume the cjs version. For some reason, trying to force transpile it through Babel does not work
# as crash happens before it even gets to that point
# We use tail to avoid the first line of the the output which is the command itself
yarn babel node_modules/@mapbox/tiny-sdf/index.js | tail -n +2 > node_modules/@mapbox/tiny-sdf/index.cjs

# Patch for an issue with react-virtualized output having an invalid import
# https://github.com/bvaughn/react-virtualized/issues/1212
if [[ -f "node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js" ]]; then
  sed -i -e '/import { bpfrpt_proptype_WindowScroller } from "..\/WindowScroller.js";/d' node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js
fi

# fix ERR_REQUIRE_ESM in yarn cover
yarn babel node_modules/maplibregl-mapbox-request-transformer/src/index.js | tail -n +2 > node_modules/maplibregl-mapbox-request-transformer/src/index.cjs

# Node 22 + GCC: ANGLE (used by gl@6.x) is missing #include <cstdint> which defines uintptr_t.
# Without this patch, gl fails to compile with "error: 'uintptr_t' does not name a type".
# See: https://github.com/stackgl/headless-gl/issues/XXX
ANGLE_UTILS="node_modules/gl/angle/src/common/angleutils.h"
if [[ -f "$ANGLE_UTILS" ]] && ! grep -q '#include <cstdint>' "$ANGLE_UTILS"; then
  echo "Patching $ANGLE_UTILS: adding #include <cstdint> for Node 22 / GCC 13+ compatibility"
  sed -i 's/#include <cstddef>/#include <cstddef>\n#include <cstdint>/' "$ANGLE_UTILS"
fi

# Rebuild gl native addon if webgl.node is missing (Node 22 compatibility)
GL_BINDING="node_modules/gl/build/Release/webgl.node"
if [[ ! -f "$GL_BINDING" ]]; then
  echo "Rebuilding gl native addon for Node 22..."
  (cd node_modules/gl && node node_modules/.bin/node-gyp rebuild 2>&1 | tail -5)
fi