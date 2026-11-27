/** Experimental contract v1. Lengths in millimetres; coordinates refer to hinge axes. */
export type Vec2 = [number,number];
export type Vec3 = [number,number,number];
export interface DesignSpec {
 schema:'origami-box/spec/1'; units:'mm';
 footprint:{length:number;frontWidth:number;rearWidthRatio:number};
 /** Maximum z on the front/rear TOP HINGE-AXIS edge at the reference fully open pose.
  * For a hinge, this is the free-corner height, NOT the full edge's mean height. */
 rise:{front:number;rearRatio:number;rightToLeftRatio?:number};
 walls:{left:boolean;right:boolean};
 fabrication:{hingeGap:number;panelThickness:number;endAllowance:number};
}
export type PoseState =
 | {mode:'actuation';progress:number}
 | {mode:'assembly';progress:number;targetOpening?:number};
export interface Capabilities {
 rigidGeometry:true;constructedFoldingPath:true;passiveMotionPrediction:false;
 pressureModel:false;airtightFilmModel:false;continuousCollisionCertificate:false;
}
export interface Diagnostic {code:string;severity:'info'|'warning'|'error';message:string}
export interface Panel3D {id:string;pointsMm:Vec3[]}
export interface Design {
 schema:'origami-box/design/1';kernelVersion:'origami-box/kernel/1';engineVersion:string;spec:DesignSpec;
 frame:{origin:string;axes:{x:string;y:string;z:string};units:'mm'};
 topology:{panels:{id:string;vertexIds:string[]}[];hinges:{id:string;panelIds:[string,string];axisMm:[Vec3,Vec3]}[]};
 reference:Panel3D[];localPanels:{id:string;shapeMm:Vec2[]}[];rules:Record<string,string>;futureExtensions:{id:string;status:string;description:string;requires:string}[];
 derivedFabrication:{rearApexReliefMm:number;nominalAssemblyTarget:number;thicknessModel:string};
 parameterRelations:{code:string;paths:string[];relation:string;reason:string}[];
 capabilities:Capabilities;diagnostics:Diagnostic[];
}
export interface PanelSolidMesh extends SceneMesh {role:'panel';panelId:string;thicknessMm:number;referenceSurface:'midplane'}
export interface Pose {schema:'origami-box/pose/1';state:PoseState;panels:Panel3D[];meshes:PanelSolidMesh[];placements:{id:string;originMm:Vec3;rotationRowMajor:[Vec3,Vec3,Vec3]}[];contacts:[string,string][];interpretation:string}
export interface Segment {from:Vec2;to:Vec2}
/** Progress is local to the transition INTO this stage, not actuation/pressure. */
export interface FabricationState {stageId:string;progress?:number}
export interface FabricationStage {id:string;operation:'prepare'|'fold'|'seal'|'inlet';title:string;instruction:string;transition:{durationMs:number}}
export interface SceneMesh {id:string;role:string;verticesMm:Vec3[];faces:number[][];schematic?:boolean}
export interface SceneDetail {id:string;label:string;meshIds:string[];framePointsMm:Vec3[];targetMm:Vec3}
export interface FabricationGuide {
 schema:'origami-box/fabrication-guide/1';supported:boolean;stages:FabricationStage[];
 framePointsMm?:Vec3[];diagnostics:Diagnostic[];
}
export interface FabricationPose {
 schema:'origami-box/fabrication-pose/1';state:Required<FabricationState>;stage:FabricationStage;
 panels:Panel3D[];placements:{id:string;originMm:Vec3;rotationRowMajor:Vec3[];shapeMm:Vec2[]}[];contacts:[];
 cues:{id:string;role:'fold'|'seal';pointsMm:[Vec3,Vec3];panelId?:string;active?:boolean;sealed?:boolean}[];
 film:Panel3D[];inlet:{pointMm:Vec3;active:boolean;installed:boolean;markerVisible:boolean};sealedIds:string[];
 meshes:SceneMesh[];details:SceneDetail[];
 action:null|{kind:'press-seal';phase:'approach'|'press'|'release';pressFraction:number;bondFraction:number;schematic:true};
 activeSeal:null|{id:string;pairedLinesMm:[Vec3,Vec3][];status:'coincident-ideal-guides'};
 evidence:{panelModel:string;filmModel:string;finiteThickness:string};
}
export interface FabricationValidation {
 schema:'origami-box/fabrication-validation/1';samplesPerStage:number;numericalPass:boolean;
  validationScope:'sampled-rigid-panel-geometry';manufacturingReady:false;
  guideAvailable:boolean;sealLayerAccess:'unverified';
 maxDistanceErrorMm:number;maxAreaErrorMm2:number;maxHingeErrorMm:number;
 maxClosureErrorMm:number;maxSealMismatchMm:number;maxTransitionErrorMm:number;maxPanelMapErrorMm:number;
 flatStackContactSamples:number;
 unexpectedSurfaceCrossings:{stageId:string;progress:number;pairs:[number,number][]}[];
 evidence:Record<string,string>;
}
export interface Template {
 panels:{id:string;pointsMm:Vec2[]}[];cuts:Segment[];folds:Segment[];
 seals:(Segment&{role:string;status:'unverified'})[];
 inlet:null|{center:Vec2;radius:number;status:'unverified'};
 boundsMm:{minX:number;minY:number;maxX:number;maxY:number};overlaps:[string,string][];components:number|null;
}
export interface Templates {schema:'origami-box/templates/1';units:'mm';stockSizeMm:Vec2;folding:Template;cutting:Template}
export interface APIError {code:string;path:string;message:string;details?:Record<string,unknown>}
export type Response<T> = {apiVersion:'origami-box/api/1';id:string|number|null}&(
 | {ok:true;value:T}
 | {ok:false;errors:APIError[]}
);
export type Request = {apiVersion:'origami-box/api/1';id?:string|number}&(
 | import('./intent-contracts').IntentRequest
 | {method:'describe';payload:Record<string,never>}
 | {method:'design.build';payload:{spec:DesignSpec}}
 | {method:'design.pose';payload:{spec:DesignSpec;state:PoseState}}
 | {method:'fabrication.describe';payload:{spec:DesignSpec}}
 | {method:'fabrication.pose';payload:{spec:DesignSpec;state:FabricationState}}
 | {method:'fabrication.validate';payload:{spec:DesignSpec;options?:{samples?:number}}}
 | {method:'design.templates';payload:{spec:DesignSpec;options?:{stockSizeMm?:Vec2}}}
 | {method:'design.validate';payload:{spec:DesignSpec;options?:{samples?:number;assemblySamples?:number}}}
 | {method:'design.referencePoses';payload:{spec:DesignSpec;options?:{mode?:'actuation'|'assembly';samples?:number}}}
 | {method:'design.edit';payload:{spec:DesignSpec;changes:{path:string;value:number|boolean}[];fixedPaths?:string[]}}
 | {method:'design.analyze';payload:{spec:DesignSpec}}
 | {method:'design.solvePosture';payload:{spec:DesignSpec;target:{frontMaxRiseMm?:number;rearMaxRiseMm?:number;longitudinalTiltDeg?:number;transverseTiltDeg?:number}}}
 | {method:'design.synthesize';payload:{spec:DesignSpec;goal:{frontRiseMm:number;longitudinalTiltDeg:number}}}
 | {method:'research.orientation';payload:{spec:DesignSpec;state:{progress:number;yawDeg:number}}}
 | {method:'artifact.export';payload:{spec:DesignSpec}}
 | {method:'artifact.open';payload:{artifact:{schema:'origami-box/artifact/1';engineVersion:string;design:Design}}}
 | {method:'legacy.migrate';payload:{record:Record<string,unknown>}}
);
