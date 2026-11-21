import {applyCommand} from './model.mjs';
// Deliberately controlled language. Unknown clauses are rejected, never guessed.
// A future language model can emit the same typed commands without engine access.
export function interpretText(intent,text){
 if(typeof text!=='string'||!text.trim())return {ok:false,errors:[{message:'Enter a design statement.'}]};
 let result=structuredClone(intent);const commands=[],errors=[];
 const clauses=text.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean);
 for(const [index,clause] of clauses.entries()){
  const s=clause.toLowerCase().replace(/\s+/g,' ').replace(/\.$/,''),source={kind:'text',clause,index};let command=null,match;
  if((match=s.match(/^(?:with (?:a |an )?)?(trapezoidal outline|front\/rear lift|left\/right lift)\s+ratio\s+([0-9]+(?:\.[0-9]+)?)$/))){
   command={type:'set-feature',feature:{'trapezoidal outline':'outline','front/rear lift':'longitudinal','left/right lift':'lateral'}[match[1]],value:Number(match[2]),source};
  }else if((match=s.match(/^(left|right) rise\s+([0-9]+(?:\.[0-9]+)?)\s*(?:mm)?$/))){
   command={type:'direct-side-rise',side:match[1],value:Number(match[2]),source};
  }else if((match=s.match(/^(length|front width|rear width|front rise|rear rise|gap|thickness|allowance)\s*(?:=|is|to)?\s*(-?\d+(?:\.\d+)?)\s*(?:mm)?$/))){
   const map={length:'length','front width':'frontWidth','rear width':'rearWidth','front rise':'frontRise','rear rise':'rearRise',gap:'gap',thickness:'thickness',allowance:'allowance'};
   command={type:'set-value',field:map[match[1]],value:Number(match[2]),source};
  }else if((match=s.match(/^rear (width|rise)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)\s*(?:x|×|times)\s*(?:the )?front \1$/))){
   command={type:'add-block',op:match[1]==='width'?'width-ratio':'rise-ratio',value:Number(match[2]),source};
  }else if(/^(?:equal|match) widths$/.test(s))command={type:'add-block',op:'equal-width',source};
  else if(/^(?:equal|match) rises$/.test(s))command={type:'add-block',op:'equal-rise',source};
  else if((match=s.match(/^(remove|restore) (left|right) (?:folding )?wall$/))){
   const absent=result.blocks.some(b=>b.op==='wall-off'&&b.side===match[2]);
   if(absent===(match[1]==='remove'))continue;
   command={type:'toggle-wall',side:match[2],source};
  }else if((match=s.match(/^tilt\s*(?:=|to)?\s*(-?\d+(?:\.\d+)?)\s*(?:deg|degrees|°)?$/)))command={type:'add-block',op:'tilt',value:Number(match[1]),source};
  else if((match=s.match(/^(lock|fix) (length|front width|rear width|front rise|rear rise)$/))){
   const field=match[2].replace(/ (\w)/g,(_,c)=>c.toUpperCase());command={type:'add-block',op:'lock',field,source};
  }
  if(!command){errors.push({code:'UNRECOGNIZED_CLAUSE',clause,index,message:`Unrecognized statement: “${clause}”. No changes were applied.`});continue;}
  try{
   result=applyCommand(result,command);commands.push(command);
   if(command.type==='set-value'){
    const fixed={type:'add-block',op:'lock',field:command.field,value:command.value,source};
    result=applyCommand(result,fixed);commands.push(fixed);
   }
  }catch(e){errors.push({clause,index,message:e.message});}
 }
 return errors.length?{ok:false,errors}:{ok:true,intent:result,commands};
}
