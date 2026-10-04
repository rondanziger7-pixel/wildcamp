#!/usr/bin/env python3
"""Estimate the local upper forest limit (treeline altitude) from swissTLM3D forest polygons.

swissTLM3D polygon vertices carry heights (LN02). For each 1 km cell we take the
98th percentile of forest-vertex heights, then take the maximum over a 5 km
neighbourhood. Taking the maximum is deliberately conservative: a higher treeline
means fewer spots are called "above the treeline".

Input:  swissTLM3D TLM_BODENBEDECKUNG shapefiles (OST + WEST), LV95.
Output: public/treeline-surface.bin.gz, read by src/treelinesurface.ts.

Format (little-endian), gzip-compressed:
  magic "WTL1" | int32 width | int32 height | int32 cell_m | int32 x0 | int32 y0
  then width*height int16 heights in metres, row-major from the north-west
  corner; 0 = no forest nearby, so no estimate.

Usage: python3 scripts/build_treeline_surface.py <dir-with-BODENBEDECKUNG-shp> [out]
Needs: numpy shapely pyogrio
"""
import glob
import gzip
import struct
import sys

import numpy as np
import pyogrio
import shapely

X0, X1 = 2485000, 2834000
Y0, Y1 = 1075000, 1296000
CELL = 1000
PERCENTILE = 98
MIN_VERTICES = 30  # ignore cells with too few vertices to trust
RADIUS_CELLS = 5  # 5 km


def main() -> None:
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "public/treeline-surface.bin.gz"
    width = -(-(X1 - X0) // CELL)
    height = -(-(Y1 - Y0) // CELL)

    chunks = []
    for shp in sorted(glob.glob(f"{src}/*BODENBEDECKUNG*.shp")):
        _, _, geoms, _ = pyogrio.raw.read(
            shp, columns=["OBJEKTART"], where="OBJEKTART IN ('Wald','Wald offen')", read_geometry=True
        )
        chunks.append(shapely.get_coordinates(shapely.from_wkb(geoms), include_z=True))
        print(f"read {shp.split('/')[-1]}: {len(chunks[-1]):,} vertices", file=sys.stderr)
    v = np.vstack(chunks)
    col = ((v[:, 0] - X0) // CELL).astype(np.int64)
    row = ((Y1 - v[:, 1]) // CELL).astype(np.int64)
    ok = (col >= 0) & (col < width) & (row >= 0) & (row < height)
    col, row, z = col[ok], row[ok], v[ok, 2]

    cell = row * width + col
    order = np.lexsort((z, cell))
    cell, z = cell[order], z[order]
    starts = np.flatnonzero(np.r_[True, cell[1:] != cell[:-1]])
    ends = np.r_[starts[1:], len(cell)]
    local = np.full(width * height, np.nan)
    for s, e in zip(starts, ends):
        if e - s >= MIN_VERTICES:
            local[cell[s]] = z[s + int((e - s - 1) * PERCENTILE / 100)]
    local = local.reshape(height, width)

    surface = np.full_like(local, np.nan)
    pad = np.pad(local, RADIUS_CELLS, constant_values=np.nan)
    for dr in range(-RADIUS_CELLS, RADIUS_CELLS + 1):
        for dc in range(-RADIUS_CELLS, RADIUS_CELLS + 1):
            if dr * dr + dc * dc > RADIUS_CELLS * RADIUS_CELLS:
                continue
            shifted = pad[RADIUS_CELLS + dr : RADIUS_CELLS + dr + height, RADIUS_CELLS + dc : RADIUS_CELLS + dc + width]
            surface = np.fmax(surface, shifted)

    grid = np.nan_to_num(surface, nan=0).round().astype("<i2")
    header = b"WTL1" + struct.pack("<iiiii", width, height, CELL, X0, Y1)
    with gzip.open(out, "wb", compresslevel=9) as f:
        f.write(header + grid.tobytes())
    valid = grid[grid > 0]
    print(
        f"wrote {out}: {width}x{height} @ {CELL} m, {valid.size} cells with an estimate, "
        f"treeline {valid.min()}-{valid.max()} m (median {int(np.median(valid))})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
