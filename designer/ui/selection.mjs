// Presentation-only selection. Geometry supplies named regions and anchors.
export const directionColors={front:'#267bab',rear:'#286c96',left:'#9254ad',right:'#b77b26'};
export function modelPick(geometry,{panelId,edge},current=null){
 if(!geometry)return null;
 const fixed=geometry.sideTargets.find(s=>!s.present)?.side;
 if(edge)return {feature:['front','rear'].includes(edge)?'longitudinal':fixed?'connection':'lateral',edge,...(fixed?{side:fixed}:{})};
 if(!panelId)return null;
 const side=geometry.surfaces.find(s=>s.panelId===panelId)?.side;
 if(side)return {feature:fixed?'connection':'lateral',edge:side,side:fixed??side};
 if(['top','bottom'].includes(panelId))return {feature:'outline'};
 return null;
}
export function selectionTarget(geometry,selection){
 if(!geometry||!selection)return {panelIds:[],edgeIds:[],handleIds:[]};
 if(selection.feature==='connection')return {...geometry.targets[selection.side+'Connection'],color:'#b77b26'};
 if(selection.feature==='side')return {...geometry.targets[selection.side+'Wall'],color:directionColors[selection.side]};
 if(selection.field){
  const field=selection.field,feature=/Width$/.test(field)?'outline':/left|right/i.test(field)||field==='sideRiseRatio'?'lateral':/Rise$/.test(field)?'longitudinal':null;
  return feature?{...geometry.targets[feature],handleIds:[field],color:feature==='lateral'?directionColors.left:directionColors.front}:{panelIds:['bottom'],edgeIds:['left','right'],handleIds:['length'],color:directionColors.front};
 }
 return {...(geometry.targets[selection.feature]??{panelIds:[],edgeIds:[],handleIds:[]}),color:selection.feature==='lateral'?directionColors.left:directionColors.front};
}
