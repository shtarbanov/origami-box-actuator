# Box designer preview

This isolated preview leaves the existing site at the repository root unchanged.
It is a research prototype, not a validated pressure or material simulation.

## Read and edit the code

- `kernel/`: pure geometry, panel shapes, stencils and numerical checks.
- `api/`: versioned JSON API and Worker transport.
- `intent/` and `constraints/`: descriptive conditions, dependency resolution and editing goals.
- `ui/`: camera, renderer, selection, editor state and browser interactions.
- `adapters/`: browser Worker, CLI, SVG and presentation adapters.
- `tests/`: contracts and regression tests. Root compatibility/research tests remain for regression coverage.

The GUI calls the API; it does not import the geometry solver. The kernel has no DOM or browser dependency.

The GUI is also split into independent parameter, viewport, actuation,
fabrication and project features. The entry point only wires their ports.
See [GUI feature boundaries](docs/gui-features.md) for ownership, state leases
and how another kernel-generated manufacturing path reaches the existing GUI.

## Run locally

On Windows, double-click **Open Designer.cmd** in the repository root. It starts a
hidden loopback-only server and opens the designer in your default browser.
Subsequent launches reuse the server for this checkout; occupied ports belonging
to other apps are skipped. Node.js or Python must be installed once. Nothing is
installed by the launcher, and no terminal commands are needed for normal use.

Install Node.js, then from this folder:

```sh
npm start
```

Open http://127.0.0.1:4173/ . No npm packages or backend service are required.
Run `npm test` from this folder to run all checks.

To serve the whole repository instead, run `python -m http.server 4180` from the repository root and open http://127.0.0.1:4180/designer/ .
Use HTTP(S), rather than opening index.html with file://, because the app loads ES modules and a Worker.

## Fabrication guide

Choose **Fabrication guide** below the 3D viewer, then use **< / >** (or left/right
arrow keys when the step controls have focus). It starts from the flat stencil:
the rectangular box uses its original half fold. Other two-wall boxes first
fold each small-panel pair at its middle crease to align the seam. Both routes
then seal the long edge, attach the inlet, open into a box, fold the walls inward
and flatten, and seal the two ends. Back rewinds the explanation; it does not imply a
physical heat seal can be undone. Exit restores the previous design, actuation
position and camera. Normal Play remains an independent actuation preview.

`kernel/fabrication-guide.mjs` owns the sequence, instructions, rigid placements,
fold axes, seal pairs, inlet and a fixed viewing envelope. The versioned
`fabrication.describe`, `fabrication.pose` and `fabrication.validate` API calls
expose these data through the Worker. `ui/fabrication-player.mjs` only navigates
and times API samples; `ui/fabrication-render.mjs` draws the returned cues.
`kernel/fabrication-visuals.mjs` additionally supplies schematic sealing-jaw and
hollow inlet meshes and their movements. The renderer projects those meshes;
it does not construct their shapes or decide their trajectories. Detail views
make the pressing action and the inlet's flange, neck and bore easier to see.

Guides support boxes with both side walls: rectangular or trapezoidal outlines,
front/rear pitch, lateral tilt and their valid combinations, including the
zero-rear-rise longitudinal limit. Direct-side hinges retain a separate unsupported
diagnostic. The generalized route adds one side-pair prefold step and is generated
entirely in the kernel; the GUI is unchanged. Zero-thickness panel distances,
areas, rigid-map embedding, hinge continuity, seam closure and sealing-guide
coincidence are tested.
Coplanar stacking is intentional; finite-thickness stacking and complete flexible
end-film/gusset behavior are not certified. See
[the geometric construction](docs/fabrication-guide.md).

## Static hosting

The runtime consists of HTML, CSS and JavaScript; the server.mjs file is only a local file server.
When this folder is merged into the branch used by GitHub Pages, it can be opened at the site's /designer/ path, for example https://origami.softrobotics.io/designer/ .
Pushing a development branch does not automatically publish that URL. The current root site and CNAME are preserved.
This PR does not change Pages settings or deploy to the production domain.

## Important semantics

Core dimensions refer to virtual hinge axes. Front/rear rise parameters are maximum top-edge heights; visible rise handles target physical edge-midpoint heights.
Basic shape conditions are modifications of one box, not separate actuator types.
Removing a shape condition restores its neutral effect while respecting remaining explicit conditions and fixed values.
Each 3D drag starts from the displayed resolved design. Rejected samples do not poison later gestures.
Display settings and camera state are UI preferences, not actuator parameters.

Ranges are local numerical construction bounds. Collision/assembly checks are sampled. Film sealing, loads, passive motion and pneumatic behavior need physical validation.
See docs/block-editor.html for details.

## Attribution

Original designer: Ali Shtarbanov. Prototype development: Yoon Jong-hwan.
The preview retains the existing CC BY-NC-SA 4.0 attribution and link.
