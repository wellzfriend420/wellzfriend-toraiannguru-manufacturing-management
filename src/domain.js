export const yieldRate = (output, input) => Number(input) > 0 ? Number(output) / Number(input) : null;
export const laborRate = ({ rateType, rateAmount, salaryAmount, weekdayCount, hoursPerDay=8 }) => rateType === 'monthly_management' ? Number(salaryAmount) / Number(weekdayCount) / Number(hoursPerDay) : Number(rateAmount);
export const workMinutes = (startedAt, endedAt, breakMinutes=0) => Math.max(0, Math.round((new Date(endedAt)-new Date(startedAt))/60000)-Number(breakMinutes||0));
export const grossProfit = (sales, directCost) => ({ amount:Number(sales)-Number(directCost), rate:Number(sales)>0?(Number(sales)-Number(directCost))/Number(sales):null });
export function periodRange(period, anchor) {
  const date=new Date(`${anchor}T00:00:00+09:00`);
  if(period==='day') return {from:anchor,to:anchor};
  if(period==='week') { const day=(date.getDay()+6)%7; const from=new Date(date); from.setDate(from.getDate()-day); const to=new Date(from); to.setDate(to.getDate()+6); return {from:localDate(from),to:localDate(to)}; }
  const y=date.getFullYear(),m=date.getMonth(); return {from:`${y}-${String(m+1).padStart(2,'0')}-01`,to:localDate(new Date(y,m+1,0))};
}
const localDate=(date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
