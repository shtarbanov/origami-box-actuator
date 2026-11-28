// Display names and palette belong to presentation, never to geometry.
export function panelStyle(id){
 if(id==='bottom')return {name:'Bottom',color:'#D9E6F3'};
 if(id==='top')return {name:'Top',color:'#D9E6F3'};
 const side=id.startsWith('left')?'1':'2';
 return {name:`Side ${side}${id.endsWith('lower')?'A':'B'}`,color:side==='1'?'#CFE8DF':'#F2DEC7'};
}
export function decorateNet(net){return {...net,faces:net.faces.map(f=>({...f,...panelStyle(f.id)}))};}
