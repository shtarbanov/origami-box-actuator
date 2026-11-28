import {createController} from './ui/controller.mjs';
try{
const query=new URL(location.href).searchParams,value=JSON.parse(query.get('design')),controller=createController();
const spec=controller.import(value.schema?value:{schema:'origami-reference/0.2',parameters:value});
const paper=query.get('paper')??value.paper??'A4',bundle=controller.build(spec,paper);
if(!bundle.exportable)throw Error('Printing is unavailable because page fit, geometry or thickness checks failed.');
const pages=[bundle.sheets.cutting,bundle.sheets.folding];
const style=document.createElement('style');style.textContent=`@page{size:${paper==='Letter'?'letter':paper} landscape;margin:0}`;document.head.append(style);
document.getElementById('pages').innerHTML=pages.map(s=>`<div class="page">${s.svg}</div>`).join('');
document.getElementById('print').addEventListener('click',()=>window.print());
}catch(e){document.getElementById('pages').textContent=e.message;document.getElementById('print').disabled=true;}
