// Compatibility facade for old research scripts / schema 0.2 records.
// The new UI uses api/client.mjs instead. No new features should depend on this.
import * as core from './kernel/geometry.mjs';
import {designRules,futureExtensions} from './kernel/design-rules.mjs';
import {legacySheet} from './adapters/legacy-sheet.mjs';
import {decorateNet} from './adapters/presentation.mjs';
export {distance,panelWorld,lengthError} from './kernel/geometry.mjs';
export const papers={A4:[297,210],A3:[420,297],Letter:[279.4,215.9]};
export const defaults={...core.defaults,paper:'A4'};
export function parameters(input={}){const paper=input.paper??'A4';if(!papers[paper])throw Error('Unsupported paper size.');return {...core.parameters(input),paper};}
export function model(input={}){const p=parameters(input);return decorateNet(core.model(p));}
export function pose(input={}){return decorateNet(core.pose(parameters(input)));}
export function unfold(input={},folding=true){const p=parameters(input),size=papers[p.paper];return decorateNet(core.unfold(p,folding,{stockSizeMm:[size[0]-16,size[1]-24]}));}
export function sheet(input={},folding=true,options={}){return legacySheet(input,folding,options);}
export function record(input={}){
 const p=parameters(input),m=model(p);
 return {schema:'origami-reference/0.2',dimensionBasis:'virtual hinge axes; rigid outlines inset gap/2',parameters:p,status:'kinematic-model-physical-test-pending',designRules,futureExtensions,
 geometry:{vertices:m.v,panels:m.faces.map(f=>({id:f.id,vertices:f.ids})),hinges:m.hinges,closingHinge:m.seam},
 fabrication:{foldingPanels:unfold(p,true).faces.map(f=>({id:f.id,pointsMm:f.panel})),cornerChamfer:'not yet applied'},
 validation:{edgeLengthErrorMm:core.lengthError(unfold(p)),physicalTest:null,pressureModel:false,filmModel:'ideal inextensible facets with centre creases; end walls excluded',hingeGapIn3D:true},
 attribution:{source:'https://origami.softrobotics.io/',contributors:['Ali Shtarbanov','Yoon Jong-hwan'],license:'CC BY-NC-SA 4.0'},
 notes:'Hinge-axis dimensions, with physical outlines inset g/2. Rear zero-height apex has g/2 solid-panel relief. Panel thickness sweep uses symmetric t/2 extrusion about the panel plane. End seals and film end walls are not validated.'};
}
