// Semantic description of solved intent, independent of rendering and geometry.
export function describeResolved({values:v,walls,measurements:m}){
 const same=(a,b)=>Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b));
 const outline=same(v.frontWidth,v.rearWidth)?'a rectangular outline':'a trapezoidal outline';
 const clauses=[{feature:'outline',text:`with ${outline}`}];
 const longitudinal=Math.abs(m.longitudinalAngleDeg)>1e-7;
 if(longitudinal)clauses.push({feature:'longitudinal',text:'with unequal front/rear lift'});
 if(!walls.left||!walls.right)clauses.push({feature:'connection',text:`opening about its ${!walls.left?'left':'right'} edge`});
 else if(!same(m.frontLeftRise,m.frontRightRise))clauses.push({feature:'lateral',text:'with unequal left/right lift'});
 if(walls.left&&walls.right&&clauses.length===1)clauses.push({feature:'longitudinal',text:'with parallel lift'});
 const directions=[];
 if(longitudinal)directions.push('front/rear');
 if(walls.left&&walls.right&&!same(m.frontLeftRise,m.frontRightRise))directions.push('left/right');
 let behavior=directions.length?'with unequal '+directions.join(' and ')+' lift':'with parallel lift';
 if(!walls.left||!walls.right)behavior=(directions.length?behavior+', ':'')+`opening about its ${!walls.left?'left':'right'} edge`;
 return {subject:'A box actuator',clauses,sentence:`A ${same(v.frontWidth,v.rearWidth)?'rectangular':'trapezoidal'} box actuator ${behavior}.`};
}
