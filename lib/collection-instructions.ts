export type InstructionChange={version:number;text:string;reason:string;at:string;actor:string;actorName:string};
export type CollectionInstructions={text:string;history:InstructionChange[]};
export function publicCollectionInstructions(value:CollectionInstructions|undefined){return value?{...value,history:value.history.map(h=>({...h,actor:''}))}:undefined;}
