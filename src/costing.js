export const itemCostType=(itemType)=>({raw:'raw_material',flavor:'flavor',packaging:'packaging'}[itemType]??'direct_material');

export function calculateProductionCost(consumptions,outputUnits){
  const units=Number(outputUnits);
  if(!Number.isFinite(units)||units<=0)throw new Error('完成数量または完成重量は0より大きくしてください');
  const totals=new Map();
  for(const row of consumptions){
    const amount=Number(row.quantity)*Number(row.unit_cost);
    const type=itemCostType(row.item_type);
    totals.set(type,(totals.get(type)??0)+amount);
  }
  return {total:[...totals.values()].reduce((a,b)=>a+b,0),components:[...totals].map(([cost_type,amount])=>({cost_type,amount,amount_per_unit:amount/units}))};
}

export function calculateShipmentSnapshot({quantity,lotComponents=[],preparationComponents=[],extraComponents=[]}){
  const grouped=new Map();
  const add=(type,amount,source_type,source_id,description)=>{
    const key=`${type}:${source_type}:${source_id??''}:${description??''}`;
    const current=grouped.get(key)??{cost_type:type,source_type,source_id:source_id??null,description:description??null,amount:0};
    current.amount+=Number(amount);grouped.set(key,current);
  };
  for(const c of lotComponents)add(c.cost_type,Number(c.amount_per_unit)*Number(quantity),c.source_type,c.source_id,c.description);
  for(const c of preparationComponents)add(c.cost_type,Number(c.amount_per_product)*Number(quantity),c.source_type,c.source_id,c.description);
  for(const c of extraComponents)add(c.cost_type,c.amount,c.source_type??'shipment',c.source_id,c.description);
  const details=[...grouped.values()].map(x=>({...x,amount:Math.round(x.amount)}));
  const directCost=details.reduce((sum,x)=>sum+x.amount,0);
  return {details,directCost};
}
