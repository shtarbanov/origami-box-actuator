// A gesture starts from the design the user can see. A rejected draft is never
// the source of its next sample, or of a later gesture on the visible model.
export function createDragSession(displayedIntent){
 const origin=structuredClone(displayedIntent);
 return {request(command){return {intent:structuredClone(origin),command:structuredClone(command)};}};
}
