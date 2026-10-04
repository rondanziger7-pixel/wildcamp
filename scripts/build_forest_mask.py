#!/usr/bin/env python3
"""Rasterise swissTLM3D forest polygons into a compact national grid.

Input:  swissTLM3D TLM_BODENBEDECKUNG shapefiles (OST + WEST), LV95.
Output: public/forest-mask.bin.gz, read by src/forestmask.ts.

Format (little-endian), gzip-compressed:
  magic "WFM1" | int32 width | int32 height | int32 cell_m | int32 x0 | int32 y0
  then width*height cells, 2 bits each (4 per byte, low bits first), row-major
  from the north-west corner (x0 = west edge E, y0 = north edge N).
Cell values: 0 none, 1 Wald, 2 Wald offen, 3 Gebueschwald.

Usage: python3 scripts/build_forest_mask.py <dir-with-BODENBEDECKUNG-shp> [out] [cell_m]
Needs: numpy shapely pyogrio rasterio
"""
import glob
import gzip
import struct
import sys

import numpy as np
import pyogrio
import shapely
from rasterio import features
from rasterio.transform import from_origin

X0, X1 = 2485000, 2834000  # LV95 E extent of Switzerland (+margin)
Y0, Y1 = 1075000, 1296000  # LV95 N extent
CLASSES = {"Wald": 1, "Wald offen": 2, "Gebueschwald": 3}


def main() -> None:
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "public/forest-mask.bin.gz"
    cell = int(sys.argv[3]) if len(sys.argv) > 3 else 25
    width = -(-(X1 - X0) // cell)
    height = -(-(Y1 - Y0) // cell)
    grid = np.zeros((height, width), dtype=np.uint8)
    transform = from_origin(X0, Y1, cell, cell)

    # Paint lowest-priority class first so closed forest wins on overlap.
    polys = {name: [] for name in CLASSES}
    for shp in sorted(glob.glob(f"{src}/*BODENBEDECKUNG*.shp")):
        _, _, geoms, fields = pyogrio.raw.read(shp, columns=["OBJEKTART"], read_geometry=True)
        kinds = fields[0]
        for name in CLASSES:
            sel = geoms[kinds == name]
            polys[name].extend(shapely.force_2d(shapely.from_wkb(sel)).tolist())
        print(f"read {shp.split('/')[-1]}: {len(kinds)} features", file=sys.stderr)

    for name in ("Gebueschwald", "Wald offen", "Wald"):
        value = CLASSES[name]
        features.rasterize(
            ((g, value) for g in polys[name]),
            out=grid,
            transform=transform,
            all_touched=False,
        )
        print(f"{name}: {len(polys[name])} polygons", file=sys.stderr)

    pad = (-width) % 4
    flat = np.pad(grid, ((0, 0), (0, pad))).reshape(-1, 4)
    packed = (flat[:, 0] | (flat[:, 1] << 2) | (flat[:, 2] << 4) | (flat[:, 3] << 6)).astype(np.uint8)
    header = b"WFM1" + struct.pack("<iiiii", width + pad, height, cell, X0, Y1)
    with gzip.open(out, "wb", compresslevel=9) as f:
        f.write(header + packed.tobytes())
    print(f"wrote {out}: {width + pad}x{height} @ {cell} m, forest cells {np.count_nonzero(grid):,}", file=sys.stderr)


if __name__ == "__main__":
    main()
