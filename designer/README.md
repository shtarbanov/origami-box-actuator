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

## Run locally

Install Node.js, then from this folder:

```sh
npm start
```

Open http://127.0.0.1:4173/ . No npm packages or backend service are required.
Run `npm test` from this folder to run all checks.

To serve the whole repository instead, run `python -m http.server 4180` from the repository root and open http://127.0.0.1:4180/designer/ .
Use HTTP(S), rather than opening index.html with file://, because the app loads ES modules and a Worker.

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
