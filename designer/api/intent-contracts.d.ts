export type Dimension='length'|'frontWidth'|'rearWidth'|'frontRise'|'rearRise'|'gap'|'thickness'|'allowance'|'sideRiseRatio';
export interface Source {kind:'initial'|'block'|'direct'|'text'|'import';clause?:string;index?:number}
export interface RelationBlock {id:string;op:'equal-width'|'width-ratio'|'equal-rise'|'rise-ratio'|'tilt'|'side-rise-ratio'|'wall-off'|'lock';strength:'default'|'required';source:Source;value?:number;field?:Dimension;side?:'left'|'right';pinned?:boolean;neutral?:boolean}
export interface Intent {schema:'origami-box/intent/1';values:Record<Exclude<Dimension,'sideRiseRatio'>,number>&{sideRiseRatio?:number};blocks:RelationBlock[];lastEdit:null|{field:Dimension;value:number;source?:Source}}
export type IntentCommand=
 | {type:'set-feature';feature:'outline'|'longitudinal'|'lateral'|'connection';mode?:'ratio'|'angle';value?:number;side?:'left'|'right';source?:Source}
 | {type:'direct-side-rise';side:'left'|'right';value:number;source?:Source}
 | {type:'switch-feature-mode';feature:'longitudinal';mode:'angle'|'ratio';source?:Source}
 | {type:'edge-rise';edge:'front'|'rear'|'left'|'right';value:number;source?:Source}
 | {type:'set-value'|'direct-dimension';field:Dimension;value:number;source?:Source}
 | {type:'add-block';op:RelationBlock['op'];value?:number;field?:Dimension;side?:'left'|'right';source?:Source}
 | {type:'remove-block'|'toggle-block-lock';id:string}
 | {type:'update-block';id:string;value:number;source?:Source}
 | {type:'toggle-wall';side:'left'|'right';source?:Source}
 | {type:'reorder';ids:string[]};
export interface IntentConflict {code:string;message:string;blockIds:string[];fields:string[];repairs:{label:string;command:IntentCommand}[]}
export interface LocalRange {min:number;max:number|null;method:string;lowerTested?:number;upperTested?:number;scope?:string}
export type IntentRequest=
 | {method:'intent.describe';payload:Record<string,never>}
 | {method:'intent.resolve';payload:{intent:Intent}}
 | {method:'intent.command';payload:{intent:Intent;command:IntentCommand}}
 | {method:'intent.interpret';payload:{intent:Intent;text:string}}
 | {method:'intent.fromSpec';payload:{spec:import('./contracts').DesignSpec}}
 | {method:'intent.export';payload:{intent:Intent}}
 | {method:'intent.open';payload:{project:Record<string,unknown>}}
 | {method:'design.handles';payload:{spec:import('./contracts').DesignSpec;state?:{mode:'actuation';progress:number}}};
