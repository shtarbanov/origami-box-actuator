# GUI feature boundaries

`ui/block-app.mjs` is the composition root. It creates features and connects
their ports; it contains no form markup, gestures, fold equations or stage names.
Feature modules do not import one another. Shared utilities are presentation or
transport helpers, not an ambient mutable application state.

| Module | Owns | Receives / emits |
| --- | --- | --- |
| `design-session.mjs` | API transactions, current intent/reports, revision gating, undo/redo, persistence, edit locks | Commands and immutable API results; publishes model updates |
| `parameter-feature.mjs` | Block/number/slider forms, selected feature, debounce and focus | Model snapshot and semantic command callbacks |
| `viewport-feature.mjs` | Camera, display preferences, labels, picking/dragging, last painted scene | A normal scene or a renderer lease; emits picks and semantic edits |
| `actuation-feature.mjs` | Normal Play/Fold controls, current opening and asynchronous pose sampling | API/controller port; emits a scene with interaction handles |
| `fabrication-feature.mjs` | Guide DOM, entry/exit, keyboard controls and temporary edit/view leases | Kernel guide data through API; generic viewport renderer port |
| `project-feature.mjs` | Open/save, history buttons, paper, template tabs, print/export and status | Session port and model updates |

The parameter feature flushes pending input before the guide acquires a lock.
The actuation feature stops and settles its latest scene before it is suspended.
The viewport lease preserves the camera and last normal scene. Exit releases
both leases; it does not reset the actuation slider, edit history or selected
feature. Label offsets survive temporary viewport resizing, with explicit
re-layout still available in Display / Fit view.

## Adding another manufacturing path

Extend the kernel behind `fabrication.describe`, `fabrication.pose`, and
`fabrication.validate`. Return the ordered stages, local transition durations,
rigid panel points, fold/seal cues, accessory/tool meshes and viewing envelope.
No box-family or stage-name switch belongs in the guide player or renderer.

`fabrication-player.mjs` requests each incoming transition using the returned
stage ID and local progress. `mesh-scene.mjs` projects generic vertex/face meshes,
depth-sorts them and applies presentation materials. `fabrication-render.mjs`
draws the semantic cues and optional detail views, including their kernel-supplied
fixed envelopes. New mesh shapes require no new shape constructor in the GUI.
Unknown material roles use a generic material.

The current scene contract can describe new folds, sealing actions and attached
parts without changing these GUI features. An entirely new interaction or scene
primitive would require extending that contract and its corresponding renderer;
it should not require edits to unrelated parameter, project or playback features.

## Schematic manufacturing objects

`kernel/fabrication-visuals.mjs` constructs the two sealing jaws, a growing bond
strip and a hollow stepped inlet. The inlet has a wide low cylindrical flange,
a narrower neck and a continuous bore. Its attachment pose moves from above the
marked film location down to the film and then follows the top allowance.

Sealing stages approach, press and release the jaws, while generating the bonded
strip during the press. The timings and object proportions are instructional,
not heat-sealer settings, real inlet dimensions or a physical film simulation.
The main orthographic camera remains fixed across stages; detail cards have
their own clearly separated, fixed camera envelopes.

## Checks

Tests run the design session without a DOM, camera or guide; cover queued edits,
history, failed imports, save/load, rejection and independent edit locks; and
ensure features have no imports of one another. A guide with unfamiliar stage
IDs and a new operation name exercises the existing player without modification.
Kernel tests check pressing/releasing, bond progression, rigid inlet attachment,
the open bore mesh and isolated returned metadata.
