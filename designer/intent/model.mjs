// Shared declarative intent. No geometry engine, UI, transport or I/O.
export const INTENT_VERSION='origami-box/intent/1';
export const fields=[
 {id:'length',label:'Length',unit:'mm'},
 {id:'frontWidth',label:'Front width',unit:'mm'},
 {id:'rearWidth',label:'Rear width',unit:'mm'},
 {id:'frontRise',label:'Front max. rise',unit:'mm'},
 {id:'rearRise',label:'Rear max. rise',unit:'mm'},
 {id:'gap',label:'Panel gap',unit:'mm'},
 {id:'thickness',label:'Panel thickness',unit:'mm'},
 {id:'allowance',label:'Sealing allowance',unit:'mm'},
 {id:'sideRiseRatio',label:'Right / left rise',unit:'×',optional:true,hiddenDimension:true}
];
export const blockCatalog=[
 {op:'width-ratio',feature:'outline',label:'with a trapezoidal outline',family:'width',description:'Rear width / front width',parameter:{label:'Ratio',unit:'×',min:0,step:.05}},
 {op:'equal-width',feature:'outline',label:'with a rectangular outline',family:'width',description:'Rear width / front width'},
 {op:'rise-ratio',feature:'longitudinal',label:'with unequal front/rear lift',family:'rise',description:'Rear maximum rise / front maximum rise',parameter:{label:'Ratio',unit:'×',min:0,step:.05}},
 {op:'equal-rise',feature:'longitudinal',label:'with equal front/rear lift',family:'rise',description:'Rear maximum rise / front maximum rise'},
 {op:'tilt',feature:'longitudinal',family:'rise',label:'with unequal front/rear lift',description:'Front-to-rear top-edge inclination at full opening',parameter:{label:'Angle',unit:'°',min:-89,max:89,step:1}},
 {op:'side-rise-ratio',feature:'lateral',family:'lateral',label:'with unequal left/right lift',description:'Right rise / left rise, at the front edge',parameter:{label:'Ratio',unit:'×',min:0,step:.05}},
 {op:'wall-off',feature:'connection',label:'opening about one fixed side',description:'The selected edge connects top and bottom directly'},
 {op:'lock',label:'Fix a dimension',description:'Preserve a dimension while editing other values'}
];
export const featureCatalog=[
 {id:'outline',label:'with a trapezoidal outline',op:'width-ratio',value:.8},
 {id:'longitudinal',label:'with unequal front/rear lift',op:'rise-ratio',value:.75},
 {id:'lateral',label:'with unequal left/right lift',op:'side-rise-ratio',value:.75},
 {id:'connection',label:'opening about one fixed side',op:'wall-off'}
];
export function newIntent(){return {
 schema:INTENT_VERSION,values:{length:75,frontWidth:60,rearWidth:60,frontRise:32,rearRise:32,gap:4,thickness:.3,allowance:4,sideRiseRatio:1},
 blocks:[{id:'initial-width',op:'equal-width',strength:'default',source:{kind:'initial'}},{id:'initial-rise',op:'equal-rise',strength:'default',source:{kind:'initial'}}],lastEdit:null
};}
export function validateIntent(intent){
 if(intent?.schema!==INTENT_VERSION||!intent.values||!Array.isArray(intent.blocks))throw Error('Unsupported intent document.');
 const ids=new Set();
 for(const field of fields)if(!(field.optional&&intent.values[field.id]===undefined)&&(typeof intent.values[field.id]!=='number'||!Number.isFinite(intent.values[field.id])))throw Error(`${field.label} must be a finite number.`);
 for(const b of intent.blocks){
  if(!b.id||typeof b.id!=='string'||ids.has(b.id)||!blockCatalog.some(c=>c.op===b.op))throw Error('Unknown block or duplicate block ID.');ids.add(b.id);
  if(!['required','default'].includes(b.strength))throw Error('Unknown constraint strength.');
  if(['width-ratio','rise-ratio','side-rise-ratio','tilt','lock'].includes(b.op)&&!Number.isFinite(b.value))throw Error('Block values must be finite numbers.');
  if(b.op==='wall-off'&&!['left','right'].includes(b.side))throw Error('Select a side.');
  if(b.op==='lock'&&!fields.some(f=>f.id===b.field))throw Error('Unknown fixed dimension.');
 }
 return intent;
}
export function fromSpec(spec){
 const intent=newIntent(),v=intent.values;
 Object.assign(v,{length:spec.footprint.length,frontWidth:spec.footprint.frontWidth,rearWidth:spec.footprint.frontWidth*spec.footprint.rearWidthRatio,
  frontRise:spec.rise.front,rearRise:spec.rise.front*spec.rise.rearRatio,gap:spec.fabrication.hingeGap,thickness:spec.fabrication.panelThickness,allowance:spec.fabrication.endAllowance});
 intent.blocks=[{id:'width-link',op:'width-ratio',value:spec.footprint.rearWidthRatio,strength:'required',source:{kind:'import'}},
 {id:'rise-link',op:'rise-ratio',value:spec.rise.rearRatio,strength:(!spec.walls.left||!spec.walls.right)?'default':'required',source:{kind:'import'}}];
 for(const side of ['left','right'])if(!spec.walls[side])intent.blocks.push({id:`side-${side}`,op:'wall-off',side,strength:'required',source:{kind:'import'}});
 if(spec.rise.rightToLeftRatio!==undefined){v.sideRiseRatio=spec.rise.rightToLeftRatio;intent.blocks.push({id:'lateral-link',op:'side-rise-ratio',value:v.sideRiseRatio,strength:'required',source:{kind:'import'}});}
 return intent;
}
export function applyCommand(input,command){
 validateIntent(input);const next=structuredClone(input),source=command.source??{kind:'block'};
 const id=()=>`block-${1+Math.max(0,...next.blocks.map(b=>Number(b.id.match(/block-(\d+)/)?.[1]??0)))}`;
 const featureOf=b=>blockCatalog.find(c=>c.op===b.op)?.feature;
 function neutralize(feature){
  if(!feature)return;
  if(next.blocks.some(b=>featureOf(b)===feature&&b.strength==='required'))return;
  next.blocks=next.blocks.filter(b=>featureOf(b)!==feature);
  if(feature==='lateral'){next.values.sideRiseRatio=1;return;}
  if(feature==='connection'){
   if(!next.blocks.some(b=>featureOf(b)==='longitudinal'&&b.strength==='required'))neutralize('longitudinal');
   return;
  }
  if(!['outline','longitudinal'].includes(feature))return;
  const op=feature==='outline'?'equal-width':'tilt';
  next.blocks.push({id:id(),op,...(op==='tilt'?{value:0}:{}),strength:'default',neutral:true,source});
 }
 if(command.type==='set-feature'){
  const feature=featureCatalog.find(f=>f.id===command.feature);if(!feature)throw Error('Unknown description clause.');
  const previous=next.blocks.find(b=>blockCatalog.find(c=>c.op===b.op)?.feature===feature.id);
  const position=previous?next.blocks.indexOf(previous):next.blocks.length;
  next.blocks=next.blocks.filter(b=>blockCatalog.find(c=>c.op===b.op)?.feature!==feature.id);
  const op=feature.id==='longitudinal'&&command.mode==='angle'?'tilt':feature.op;
  const b={id:previous?.id??id(),op,strength:'required',source,...(previous?.pinned?{pinned:true}:{})};
  if(op==='wall-off')b.side=command.side??'left';else b.value=command.value??feature.value;
  next.blocks.splice(Math.min(position,next.blocks.length),0,b);next.lastEdit=null;
 }else if(command.type==='direct-side-rise'){
  if(!['left','right'].includes(command.side)||!Number.isFinite(command.value)||command.value<=0)throw Error('Side rise must be positive.');
  if(next.blocks.some(b=>b.op==='wall-off'))throw Error('A directly connected edge cannot be raised independently. Restore the folding wall first.');
  const ratio=next.values.sideRiseRatio??1,h=next.values.frontRise,left=h/Math.max(1,ratio),right=left*ratio;
  const pinned=next.blocks.some(b=>b.op==='side-rise-ratio'&&b.pinned)||next.blocks.some(b=>b.op==='lock'&&b.field==='sideRiseRatio');
  const l=command.side==='left'?command.value:pinned?command.value/ratio:left,r=command.side==='right'?command.value:pinned?command.value*ratio:right;
  const result=applyCommand(next,{type:'set-feature',feature:'lateral',value:r/l,source});result.values.frontRise=Math.max(l,r);result.lastEdit={field:'frontRise',value:Math.max(l,r),source};return result;
 }else if(command.type==='set-value'){
  if(!fields.some(f=>f.id===command.field)||!Number.isFinite(command.value))throw Error('Unknown dimension or non-finite value.');
  next.values[command.field]=command.value;next.lastEdit={field:command.field,value:command.value,source};
 }else if(command.type==='add-block'){
  if(!blockCatalog.some(c=>c.op===command.op))throw Error('Unknown block.');
  if(['equal-width','width-ratio'].includes(command.op))next.blocks=next.blocks.filter(b=>!(['equal-width','width-ratio'].includes(b.op)&&b.strength==='default'));
  if(['equal-rise','rise-ratio'].includes(command.op))next.blocks=next.blocks.filter(b=>!(['equal-rise','rise-ratio'].includes(b.op)&&b.strength==='default'));
  const b={id:id(),op:command.op,strength:'required',source};
  if(command.op==='width-ratio')b.value=command.value??next.values.rearWidth/next.values.frontWidth;
  if(command.op==='rise-ratio')b.value=command.value??next.values.rearRise/next.values.frontRise;
  if(command.op==='side-rise-ratio')b.value=command.value??next.values.sideRiseRatio??1;
  if(command.op==='tilt')b.value=command.value??0;
  if(command.op==='wall-off')b.side=command.side??'left';
  if(command.op==='lock'){b.field=command.field??'frontWidth';b.value=command.value??next.values[b.field];}
  next.blocks.push(b);next.lastEdit=null;
 }else if(command.type==='update-block'){
  const block=next.blocks.find(b=>b.id===command.id);if(!block)throw Error('Block no longer exists.');
  if(!Number.isFinite(command.value))throw Error('Enter a finite block value.');block.value=command.value;block.strength='required';block.source=source;next.lastEdit=null;
 }else if(command.type==='remove-block'){
  const removed=next.blocks.find(b=>b.id===command.id);
  next.blocks=next.blocks.filter(b=>b.id!==command.id);
  if(removed)neutralize(featureOf(removed));next.lastEdit=null;
 }else if(command.type==='toggle-block-lock'){
  const block=next.blocks.find(b=>b.id===command.id);if(!block)throw Error('Block no longer exists.');block.pinned=!block.pinned;
 }else if(command.type==='toggle-wall'){
  if(!['left','right'].includes(command.side))throw Error('Unknown side.');
  const old=next.blocks.find(b=>b.op==='wall-off'&&b.side===command.side);
  if(old){next.blocks=next.blocks.filter(b=>b!==old);neutralize('connection');}else next.blocks.push({id:id(),op:'wall-off',side:command.side,strength:'required',source});
  next.lastEdit=null;
 }else if(command.type==='reorder'){
  if(!Array.isArray(command.ids)||command.ids.length!==next.blocks.length||new Set(command.ids).size!==next.blocks.length||command.ids.some(id=>!next.blocks.some(b=>b.id===id)))throw Error('Invalid block order.');
  next.blocks=command.ids.map(id=>next.blocks.find(b=>b.id===id));
 }else if(command.type==='direct-dimension'){
  const field=command.field,value=command.value;
  if(!fields.some(f=>f.id===field)||!Number.isFinite(value))throw Error('Invalid direct edit.');
  const ratioOp=field==='rearWidth'?'width-ratio':field==='rearRise'?'rise-ratio':null;
  const equalOp=field==='rearWidth'?'equal-width':field==='rearRise'?'equal-rise':null;
  const ratio=next.blocks.find(b=>b.op===ratioOp),equal=next.blocks.find(b=>b.op===equalOp);
  if(ratio&&!ratio.pinned&&!next.blocks.some(b=>b.op==='lock'&&b.field===field)){
   ratio.value=value/next.values[field==='rearWidth'?'frontWidth':'frontRise'];ratio.strength='required';ratio.source=source;next.lastEdit=null;
  }else if(equal){const driver=field==='rearWidth'?'frontWidth':'frontRise';next.values[driver]=value;next.lastEdit={field:driver,value,source};}
  else{next.values[field]=value;next.lastEdit={field,value,source};}
 }else throw Error('Unknown intent command.');
 return validateIntent(next);
}
