# Manufacturing path for the rectangular box

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
