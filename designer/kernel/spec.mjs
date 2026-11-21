// Public design intent. All lengths are virtual hinge-axis dimensions in mm.
// No camera, animation progress, paper, UI labels, presets or implicit locks.
export const SPEC_VERSION='origami-box/spec/1';
export class DesignError extends Error{
 constructor(code,path,message,details={}){super(message);this.name='DesignError';this.code=code;this.path=path;this.details=details;}
}
const fail=(code,path,message,details)=>{throw new DesignError(code,path,message,details);};
export function defaultSpec(){return {
 schema:SPEC_VERSION,units:'mm',
 footprint:{length:75,frontWidth:48,rearWidthRatio:1},
 rise:{front:48,rearRatio:1},
 walls:{left:true,right:true},
 fabrication:{hingeGap:4,panelThickness:.3,endAllowance:4}
};}
function object(value,path,keys,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_INPUT',path,'Expected an object.');
 for(const k of Object.keys(value))if(!keys.includes(k)&&!optional.includes(k))fail('UNKNOWN_FIELD',`${path}/${k}`,'Unknown field; it will not be silently ignored.');
 for(const k of keys)if(!Object.hasOwn(value,k))fail('MISSING_FIELD',`${path}/${k}`,'Required field is missing.');
}
function number(value,path,{zero=false}={}){
 if(typeof value!=='number'||!Number.isFinite(value)||(zero?value<0:value<=0))fail('INVALID_NUMBER',path,`Expected a finite ${zero?'non-negative':'positive'} number.`);
}
export function resolveSpec(input){
 object(input,'',['schema','units','footprint','rise','walls','fabrication']);
 if(input.schema!==SPEC_VERSION)fail('UNSUPPORTED_VERSION','/schema','Unsupported design schema.',{supported:SPEC_VERSION});
 if(input.units!=='mm')fail('UNSUPPORTED_UNITS','/units','This kernel accepts millimetres only.');
 object(input.footprint,'/footprint',['length','frontWidth','rearWidthRatio']);
 object(input.rise,'/rise',['front','rearRatio'],['rightToLeftRatio']);
 object(input.walls,'/walls',['left','right']);
 object(input.fabrication,'/fabrication',['hingeGap','panelThickness','endAllowance']);
 for(const [key,value] of Object.entries(input.footprint))number(value,`/footprint/${key}`);
 number(input.rise.front,'/rise/front');number(input.rise.rearRatio,'/rise/rearRatio',{zero:true});
 if(input.rise.rightToLeftRatio!==undefined)number(input.rise.rightToLeftRatio,'/rise/rightToLeftRatio');
 for(const [key,value] of Object.entries(input.fabrication))number(value,`/fabrication/${key}`,{zero:key==='panelThickness'});
 for(const [key,value] of Object.entries(input.walls))if(typeof value!=='boolean')fail('INVALID_INPUT',`/walls/${key}`,'Wall presence must be boolean.');
 if(!input.walls.left&&!input.walls.right)fail('NO_FOLDING_WALL','/walls','At least one folding wall must remain.');
 const spec={schema:SPEC_VERSION,units:'mm',footprint:{...input.footprint},rise:{...input.rise},walls:{...input.walls},fabrication:{...input.fabrication}};
 const {length,frontWidth:W,rearWidthRatio}=spec.footprint,{front:h,rearRatio}=spec.rise;
 const hinge=!spec.walls.left||!spec.walls.right;
 const sideRatio=spec.rise.rightToLeftRatio??1;
 if(hinge&&input.rise.rightToLeftRatio!==undefined)fail('DIRECT_SIDE_PROFILE','/rise/rightToLeftRatio','A directly connected side has zero lift. A finite left/right rise ratio requires both folding walls.');
 const slope=h*(sideRatio>=1?1-1/sideRatio:sideRatio-1)/W;
 if(Math.abs(slope)>=1)fail('SIDE_SLOPE','/rise/rightToLeftRatio','The left/right height difference must be smaller than the rigid top width.');
 // Equality is explicit. Do not silently snap a requested ratio or alter locks.
 const tapered=rearWidthRatio!==1,inclined=rearRatio!==1;
 if(hinge&&Math.abs(rearRatio-rearWidthRatio)>1e-9)fail('HINGE_RATIO_CONSTRAINT','/rise/rearRatio','With a direct side hinge, rear/front rise must equal rear/front width.',{requiredRearRiseRatio:rearWidthRatio});
 let l0=h/2;
 if(hinge&&!tapered){
  const maxRise=W*Math.sin(Math.PI/3);
  if(h>maxRise+1e-9)fail('OUTSIDE_SOLVER_DOMAIN','/rise/front',`For this width, hinge rise must be at most ${maxRise.toFixed(3)} mm in the current solver.`,{maximum:maxRise});
  // h is the maximum z coordinate on the raised front edge, not the
  // free-edge chord and not the mean height of the front edge.
  l0=W*Math.sin(Math.asin(h/W)/2);
 }
 const parameters={kind:sideRatio!==1?'oblique':hinge?(tapered?'tapered-hinge':'hinge'):tapered&&inclined?'combined':inclined?'wedge':tapered?'taper':'rectangle',length,width0:W,width1:W*rearWidthRatio,l0,l1:hinge&&!tapered?l0:h*rearRatio/2,gap:spec.fabrication.hingeGap,clearance:spec.fabrication.endAllowance,thickness:spec.fabrication.panelThickness,...(sideRatio!==1?{rollDeg:Math.asin(slope)*180/Math.PI}:{})};
 return {spec,parameters,mirror:hinge&&!spec.walls.right};
}

export function legacyToSpec(input){
 const s=defaultSpec();
 s.footprint={length:input.length,frontWidth:input.width0,rearWidthRatio:input.kind==='taper'?input.width1/input.width0:1};
 s.rise={front:input.kind==='hinge'?input.width0*Math.sin(2*Math.asin(input.l0/input.width0)):2*input.l0,rearRatio:input.kind==='wedge'?input.l1/input.l0:1};
 s.walls={left:input.kind!=='hinge',right:true};
 s.fabrication={hingeGap:input.gap,panelThickness:input.thickness,endAllowance:input.clearance};
 return s;
}
