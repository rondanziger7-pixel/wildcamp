#!/usr/bin/env python3
"""Estimate the local upper forest limit (treeline altitude) from swissTLM3D forest polygons.

swissTLM3D polygon vertices carry heights (LN02). For each 500 m cell we take the 98th
percentile of the heights of all forest vertices within 1.5 km of the cell centre. Where that
disc holds fewer than MIN_VERTICES vertices (little forest nearby) the radius widens to 3 km,
then 5 km, and cells with still too few get no estimate.

Why a small radius first: an earlier version took the maximum over a 5 km neighbourhood, which
let one high stand of larches in the next valley set the limit for a spot whose own surroundings
had no trees for kilometres (near Capanna Barone, Ticino, it read 2177 m where forest within
1.5 km ends at about 1800 m), so clearly treeless ground was called "below the treeline".

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
CELL = 500
PERCENTILE = 98
MIN_VERTICES = 30  # ignore discs with too few vertices to trust
RADII_M = (1500, 3000, 5000)  # tried in this order
BIN_M = 20  # height histogram resolution
Z_MAX = 4700


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

    # one height histogram per cell, then sum the histograms of the cells inside each disc
    nb = Z_MAX // BIN_M + 1
    zb = np.clip((z // BIN_M).astype(np.int64), 0, nb - 1)
    hist = np.bincount((row * width + col) * nb + zb, minlength=width * height * nb).astype(np.uint32)
    hist = hist.reshape(height, width, nb)

    surface = np.full((height, width), np.nan)
    for radius in RADII_M:
        rc = radius // CELL
        disc = np.zeros_like(hist)
        pad = np.pad(hist, ((rc, rc), (rc, rc), (0, 0)))
        for dr in range(-rc, rc + 1):
            for dc in range(-rc, rc + 1):
                if dr * dr + dc * dc <= rc * rc:
                    disc += pad[rc + dr : rc + dr + height, rc + dc : rc + dc + width]
        total = disc.sum(axis=2)
        cum = np.cumsum(disc, axis=2, dtype=np.uint64)
        target = np.ceil(total * PERCENTILE / 100).astype(np.uint64)
        at = (cum >= target[:, :, None]).argmax(axis=2)
        est = at * BIN_M + BIN_M / 2
        use = np.isnan(surface) & (total >= MIN_VERTICES)
        surface[use] = est[use]
        del disc, pad, cum
        print(f"radius {radius} m: {int(use.sum())} cells filled", file=sys.stderr)

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
