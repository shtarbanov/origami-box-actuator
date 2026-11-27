# Actual panel thickness in the main designer

The normal 3D designer now renders closed panel prisms at the configured
**Panel thickness**, including front/back surfaces and perimeter faces. It
uses the actual millimetre value with the same orthographic camera scale in
every direction. There is no thickness multiplier, visual layer explosion or
automatic camera rescaling during orbit.

`kernel/panel-solid.mjs` generates the prisms; `evaluatePose` transports them
as additive `Pose.meshes` data through the existing API/Worker. The unchanged
`Pose.panels` and placements remain panel mid-surfaces for existing clients,
handles, dimensions and template generation. The TypeScript contract describes
both. `ui/render.mjs` only projects, sorts and shades the supplied faces. Frame
fitting includes the supplied solid vertices. Side facets keep their panel IDs
for clicking/Ctrl-clicking/highlighting, with one keyboard target per panel.

The main designer already audits **symmetric panel prisms**, so display uses
the same model: half the thickness on either side of the existing mid-surface.
The separate finite fabrication study uses a **one-sided film attachment**.
These are explicit distinct reference conventions. The main designer does not
silently change its linkage transforms, bend gaps or collision model to match
the fabrication study. Finite overlap on an ideal collapsed pose is still
reported; rendering volume is not a new compliant-hinge/path certificate.

Zero thickness remains supported and renders one face. The old rectangular
fabrication guide retains its explicitly ideal mid-surface scope; the new
research fabrication viewer is the one that models finite stack accommodation.

Tests check API transport, matching mid-surfaces, exact thickness, positive
closed volumes and all vertex-pair distances through actuation/assembly for
box, combined taper/tilt and direct-hinge designs. Thickness changes alter solid
depth without changing panel dimensions; selection, framing and zero thickness
also have regression coverage.
