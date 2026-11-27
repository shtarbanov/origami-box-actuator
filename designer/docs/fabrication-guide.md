# Rigid-panel manufacturing paths

This is a new path, not a subdivision of synchronous hinge interpolation in the
legacy `assembly()` function. The latter remains available for compatibility.
The kernel generates ordered operations and independent rigid maps for all six
panels. The UI requests samples of one incoming operation at a time.

## Coordinates and construction

Let W be the virtual top/bottom width, L the axial length, and l half the maximum
rise. These are hinge-axis dimensions; physical panels are inset by g/2, using
the same outlines as the folding stencil. The bottom front corners are
A=(-W/2,0,0) and B=(W/2,0,0); corresponding rear points have y=L.

1. **Flat stencil.** Cross-section strip order is bottom, left-lower, left-upper,
   top, right-upper, right-lower. Each face retains its own vertex map so that
   the two copies of the closing seam remain distinct before sealing.
2. **Half fold.** Rotate the last three panels together by pi about E-J, the
   second marked solid fold. Rodrigues' rotation specialized to this y axis is
   an exact isometry. Afterward the top is translated by (-2l,0,0) relative to
   the bottom. Both outer copies of B-C coincide.
3. **Long seal.** No panel motion. The kernel emits two coincident ideal seam
   segments and records the longitudinal seam as closed.
4. **Inlet.** No panel motion. The marked circle moves with the top allowance.
   Inlet fitting/puncture instructions occur before end closure.
5. **Open the pouch.** For theta from 0 to pi/2, set
   d=(-2l cos(theta),0,2l sin(theta)). The top corners are the bottom corners
   plus d; both wall midhinges are their corresponding bottom corners plus d/2.
   Each wall half has length |d/2|=l, and all axial edges have length L. All
   rectangles remain rigid and all six longitudinal connections close. The
   ending upright box is exactly the opening=1 pose of the inward-fold branch.
6. **Fold inward and flatten.** With u decreasing from 1 to 0, let h=2lu and
   q=l sqrt(1-u^2). Left midhinges have x=-W/2+q, z=h/2; right midhinges have
   x=W/2-q, z=h/2. The top translates only in z by h. Thus q^2+(h/2)^2=l^2:
   each wall half remains congruent. At u=0 the top and bottom overlap and the
   wall creases face inward (><).
7. **Front seal.** Hold the flattened configuration; the front top/bottom
   allowance lines both lie at y=-(l+c), z=0 and have identical endpoints.
8. **Rear seal.** Hold the same configuration; the rear paired lines lie at
   y=L+l+c, z=0. The kernel retains all completed seal IDs.

Reversing a step samples that same operation in reverse. No world-vertex
interpolation is performed in the UI. The same viewing envelope covers all
rotation arcs, so advancing does not refit or zoom the camera.

## Evidence and limits

`fabrication.validate` samples every operation and checks all pairwise physical
panel vertex distances, panel areas, both endpoints of every hinge, closure
after the first seal, continuity between neighboring operations, and paired seal
endpoints at sealing stages. Interior samples of the moving operations are also
checked for zero-thickness surface crossings. Flat endpoints intentionally stack
and are not treated as impossible sheet intersections.

The distance and closure identities above establish the ideal rigid linkage;
numerical tests guard implementation error. Collision checks are sampled, not
a continuous collision certificate. Positive-thickness panels need stack offsets
and compliant film hinges that this ideal instructional model does not solve.

The four translucent top/bottom allowance strips are schematic guides carried
by their parent plates. Paired guide endpoints really coincide in the flattened
sealing pose, but a full inextensible membrane, inward-folded end gussets, airtight
seal widths, the inlet hardware and post-seal inflation are not simulated.
The last two stages stay flattened; leaving the guide returns to the separate
actuation preview rather than falsely transporting sealed film as rigid plates.


## Generalized two-wall boxes: prefold the small-panel pairs

The finished 3D closed linkage and a particular single-hinge fold of the open net
are different geometric questions. For example, with front/rear widths 80/64 mm,
length 75 mm and equal maximum rises 30 mm, rotating the entire tail by pi about
E-J leaves the closing-seam endpoints displaced by 6.3639 mm. The parallel lines
are only 0.675 mm apart normally; endpoint displacement is not the normal gap.
This is a limitation of that fold choice, not an impossibility of the actuator.

For the nonrectangular two-wall families the kernel instead generates nine stages:
layout; first side-pair prefold; opposite side-pair prefold; long seal; inlet;
open pouch on the outward branch; fold inward and flatten; front seal; rear seal.
The existing rectangular eight-stage route is retained.

1. Rotate faces 2 through 5 as one rigid tail by pi about K-L, the middle crease
   of the first small-panel pair. The top comes over the bottom.
2. Rotate face 5 by pi about the now-transformed M-N, the middle crease of the
   other small-panel pair. The two small-panel pairs are stacked outboard, the
   congruent top and bottom coincide, and both endpoints of B-C close.
3. Seal that matching long edge and attach the inlet. An additional E-J half
   fold is neither needed nor part of this route.
4. Open the closed pouch along the outward side-wall branch. For every opening,
   take the existing closed pose and reflect each middle side hinge across the
   plane containing its bottom and top outer hinge lines. The outer hinge lines
   lie in the reflection plane, so they stay fixed. Both adjacent facets undergo
   the same isometry, preserving their shapes and shared middle hinge.
5. At zero opening the limiting reflection plane is the vertical plane through
   the bottom side edge. The outward midhinges equal the two-prefold endpoint.
   At the designed fully raised pose both facets of each side are coplanar, so
   outward and inward branches meet. That exact endpoint map is reused to avoid
   reflecting tiny floating-point square-root residuals at tangency.
6. Continue along the existing inward branch to the flat stack, then perform
   both end seals with the paired end guides coincident.

`kernel/fabrication-motion.mjs` implements the tail rotations and reflected branch.
`fabrication-guide.mjs` owns the shape-dependent stage program, all pose/cue
coordinates and the viewing envelope. There are no new stage or family switches
in the GUI. The two-fold endpoint and branch joins are tested on taper, pitch,
zero-height apex, lateral tilt, mixed tilt/taper and reversed parameter cases.

### Stronger audit and scope

The audit now checks the virtual panel vertices as well as the inset physical
outlines. Every vertex-pair distance must be constant, and embedding the virtual
vertices through each panel's rigid map must reconstruct all hinge anchors. This
prevents an orthonormal panel renderer from hiding an inconsistent fourth corner.

Coplanar overlaps occur intentionally when panels have been stacked, including
throughout the second prefold. They are counted separately from noncoplanar
surface crossings. The audit samples all stages and checks closure after sealing,
branch continuity, seal-guide alignment and rigid-map consistency. A 50-case valid
parameter grid sampled at 101 poses per stage had no noncoplanar crossings; 10
additional zero-rise/lateral-tilt inputs were rejected by the existing design
constraints. This is sampled collision evidence, not a continuous or finite-
thickness collision certificate. Film pleats, material compliance and airtight
manufacturing remain outside this ideal-panel model.
