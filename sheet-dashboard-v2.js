const C={black:{red:.025,green:.028,blue:.035},panel:{red:.07,green:.075,blue:.09},red:{red:.55,green:.02,blue:.04},red2:{red:.22,green:.015,blue:.025},white:{red:.96,green:.96,blue:.98},muted:{red:.62,green:.64,blue:.69},green:{red:.15,green:.72,blue:.38},amber:{red:.95,green:.62,blue:.12},blue:{red:.25,green:.55,blue:.95}};
const rgb=x=>({rgbColor:x});
const range=(sid,r1,r2,c1,c2)=>({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
const merge=(sid,r1,r2,c1,c2)=>({mergeCells:{range:range(sid,r1,r2,c1,c2),mergeType:'MERGE_ALL'}});
const fmt=(sid,r1,r2,c1,c2,format)=>({repeatCell:{range:range(sid,r1,r2,c1,c2),cell:{userEnteredFormat:format},fields:'userEnteredFormat'}});
const width=(sid,i,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:px},fields:'pixelSize'}});

async function styleDashboard(sheets,spreadsheetId,title='Dashboard'){
  const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties(sheetId,title)'});
  const p=(meta.data.sheets||[]).map(s=>s.properties).find(x=>x.title===title);
  if(!p) return;
  const sid=p.sheetId;
  const req=[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{hideGridlines:true,frozenRowCount:3},tabColorStyle:rgb(C.red)},fields:'gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle'}},
    {unmergeCells:{range:range(sid,0,30,0,8)}},
    fmt(sid,0,30,0,8,{backgroundColorStyle:rgb(C.black),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE'}),
    merge(sid,0,2,0,8),
    fmt(sid,0,2,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:20},horizontalAlignment:'LEFT',verticalAlignment:'MIDDLE'}),
    merge(sid,2,3,0,8),
    fmt(sid,2,3,0,8,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.muted),italic:true,fontSize:10},horizontalAlignment:'LEFT',verticalAlignment:'MIDDLE'}),
    merge(sid,8,9,0,8),
    fmt(sid,8,9,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:12},horizontalAlignment:'LEFT',verticalAlignment:'MIDDLE'}),
    merge(sid,13,14,0,8),
    fmt(sid,13,14,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:12},horizontalAlignment:'LEFT',verticalAlignment:'MIDDLE'})
  ];
  const cards=[[0,2,C.blue],[2,4,C.green],[4,6,C.red],[6,8,C.amber]];
  for(const [a,b,accent] of cards){
    req.push(merge(sid,4,5,a,b),merge(sid,5,7,a,b),fmt(sid,4,5,a,b,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.muted),bold:true,fontSize:10},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',borders:{top:{style:'SOLID_THICK',colorStyle:rgb(accent)}}}),fmt(sid,5,7,a,b,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(accent),bold:true,fontSize:18},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE'}));
  }
  [150,150,150,150,150,150,150,150].forEach((px,i)=>req.push(width(sid,i,px)));
  await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:req}});
}
module.exports={styleDashboard};
