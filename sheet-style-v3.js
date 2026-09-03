const C={
  black:{red:.025,green:.028,blue:.035},
  panel:{red:.07,green:.075,blue:.09},
  panel2:{red:.095,green:.10,blue:.12},
  red:{red:.55,green:.02,blue:.04},
  red2:{red:.22,green:.015,blue:.025},
  white:{red:.96,green:.96,blue:.98},
  muted:{red:.62,green:.64,blue:.69},
  green:{red:.15,green:.72,blue:.38},
  greenDark:{red:.035,green:.18,blue:.09},
  amber:{red:.95,green:.62,blue:.12},
  amberDark:{red:.20,green:.12,blue:.02},
  blue:{red:.25,green:.55,blue:.95},
  danger:{red:.78,green:.08,blue:.10},
  dangerDark:{red:.22,green:.025,blue:.035}
};
const rgb=x=>({rgbColor:x});
const range=(sid,r1,r2,c1,c2)=>({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
const fmt=(sid,r1,r2,c1,c2,format)=>({repeatCell:{range:range(sid,r1,r2,c1,c2),cell:{userEnteredFormat:format},fields:'userEnteredFormat'}});
const width=(sid,i,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:px},fields:'pixelSize'}});
const height=(sid,r1,r2,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'ROWS',startIndex:r1,endIndex:r2},properties:{pixelSize:px},fields:'pixelSize'}});
const merge=(sid,r1,r2,c1,c2)=>({mergeCells:{range:range(sid,r1,r2,c1,c2),mergeType:'MERGE_ALL'}});

function baseTable(req,sid,cols,widths,rows=1000){
  req.push(
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{hideGridlines:true,frozenRowCount:1},tabColorStyle:rgb(C.red)},fields:'gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle'}},
    fmt(sid,0,rows,0,cols,{backgroundColorStyle:rgb(C.black),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE'}),
    fmt(sid,0,1,0,cols,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:11},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',borders:{bottom:{style:'SOLID_THICK',colorStyle:rgb(C.red)}}}),
    fmt(sid,1,rows,0,cols,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP',borders:{bottom:{style:'SOLID',colorStyle:rgb(C.panel2)}}}),
    height(sid,0,1,36),height(sid,1,rows,30)
  );
  widths.forEach((px,i)=>req.push(width(sid,i,px)));
}

function clearConditionalRules(req,sheet){
  const count=(sheet.conditionalFormats||[]).length;
  for(let i=count-1;i>=0;i--) req.push({deleteConditionalFormatRule:{sheetId:sheet.properties.sheetId,index:i}});
}

async function styleAllSheets(sheets,spreadsheetId,T){
  const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),conditionalFormats)'});
  const byTitle=new Map((meta.data.sheets||[]).map(s=>[s.properties.title,s]));
  const req=[];

  const dash=byTitle.get(T.dashboard);
  if(dash){
    const sid=dash.properties.sheetId;
    req.push(
      {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{hideGridlines:true,frozenRowCount:3},tabColorStyle:rgb(C.red)},fields:'gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle'}},
      {unmergeCells:{range:range(sid,0,30,0,8)}},
      fmt(sid,0,30,0,8,{backgroundColorStyle:rgb(C.black),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE'}),
      merge(sid,0,2,0,8),fmt(sid,0,2,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:20},verticalAlignment:'MIDDLE'}),
      merge(sid,2,3,0,8),fmt(sid,2,3,0,8,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.muted),italic:true,fontSize:10},verticalAlignment:'MIDDLE'}),
      merge(sid,8,9,0,8),fmt(sid,8,9,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:12},verticalAlignment:'MIDDLE'}),
      merge(sid,13,14,0,8),fmt(sid,13,14,0,8,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:12},verticalAlignment:'MIDDLE'})
    );
    const cards=[[0,2,C.blue],[2,4,C.green],[4,6,C.red],[6,8,C.amber]];
    for(const [a,b,accent] of cards) req.push(
      merge(sid,4,5,a,b),merge(sid,5,7,a,b),
      fmt(sid,4,5,a,b,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.muted),bold:true,fontSize:10},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',borders:{top:{style:'SOLID_THICK',colorStyle:rgb(accent)}}}),
      fmt(sid,5,7,a,b,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(accent),bold:true,fontSize:18},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE'})
    );
    [150,150,150,150,150,150,150,150].forEach((px,i)=>req.push(width(sid,i,px)));
  }

  const members=byTitle.get(T.members);
  if(members){
    const sid=members.properties.sheetId; clearConditionalRules(req,members);
    baseTable(req,sid,7,[175,210,180,330,145,135,210]);
    req.push(
      fmt(sid,1,1000,0,1,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
      fmt(sid,1,1000,4,5,{textFormat:{bold:true},horizontalAlignment:'CENTER'}),
      fmt(sid,1,1000,5,7,{textFormat:{foregroundColorStyle:rgb(C.muted)}}),
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,4,5)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'BETAALD'}]},format:{backgroundColorStyle:rgb(C.greenDark),textFormat:{foregroundColorStyle:rgb(C.green),bold:true}}}},index:0}},
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,4,5)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'OPENSTAAND'}]},format:{backgroundColorStyle:rgb(C.dangerDark),textFormat:{foregroundColorStyle:rgb(C.danger),bold:true}}}},index:0}}
    );
  }

  const payments=byTitle.get(T.payments);
  if(payments){
    const sid=payments.properties.sheetId; clearConditionalRules(req,payments);
    baseTable(req,sid,10,[205,110,180,220,125,125,205,205,190,300]);
    req.push(
      fmt(sid,1,1000,0,1,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
      fmt(sid,1,1000,4,5,{textFormat:{foregroundColorStyle:rgb(C.green),bold:true},horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}),
      fmt(sid,1,1000,5,6,{textFormat:{bold:true},horizontalAlignment:'CENTER'}),
      fmt(sid,1,1000,6,8,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,5,6)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'APPROVED'}]},format:{backgroundColorStyle:rgb(C.greenDark),textFormat:{foregroundColorStyle:rgb(C.green),bold:true}}}},index:0}},
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,5,6)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'REVERSED'}]},format:{backgroundColorStyle:rgb(C.dangerDark),textFormat:{foregroundColorStyle:rgb(C.danger),bold:true}}}},index:0}}
    );
  }

  const expenses=byTitle.get(T.expenses);
  if(expenses){
    const sid=expenses.properties.sheetId; clearConditionalRules(req,expenses);
    baseTable(req,sid,10,[205,205,125,170,340,185,190,145,125,300]);
    req.push(
      fmt(sid,1,1000,2,3,{textFormat:{foregroundColorStyle:rgb(C.danger),bold:true},horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}),
      fmt(sid,1,1000,7,8,{horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}),
      fmt(sid,1,1000,8,9,{textFormat:{bold:true},horizontalAlignment:'CENTER'}),
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,8,9)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'ACTIVE'}]},format:{backgroundColorStyle:rgb(C.amberDark),textFormat:{foregroundColorStyle:rgb(C.amber),bold:true}}}},index:0}},
      {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,8,9)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'REVERSED'}]},format:{backgroundColorStyle:rgb(C.dangerDark),textFormat:{foregroundColorStyle:rgb(C.danger),bold:true}}}},index:0}}
    );
  }

  const tx=byTitle.get(T.transactions);
  if(tx){
    const sid=tx.properties.sheetId; baseTable(req,sid,9,[205,205,175,125,180,210,340,210,145]);
    req.push(fmt(sid,1,1000,3,4,{horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}),fmt(sid,1,1000,8,9,{textFormat:{bold:true},horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}));
  }

  const logs=byTitle.get(T.logs);
  if(logs){
    const sid=logs.properties.sheetId; baseTable(req,sid,6,[205,190,180,210,470,220]);
    req.push(fmt(sid,1,1000,0,1,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),fmt(sid,1,1000,1,2,{textFormat:{foregroundColorStyle:rgb(C.amber),bold:true}}));
  }

  const settings=byTitle.get(T.settings);
  if(settings){
    const sid=settings.properties.sheetId; baseTable(req,sid,2,[260,540]);
    req.push(fmt(sid,1,1000,0,1,{textFormat:{foregroundColorStyle:rgb(C.amber),bold:true}}),fmt(sid,1,1000,1,2,{textFormat:{foregroundColorStyle:rgb(C.muted)}}));
  }

  if(req.length) await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:req}});
}

module.exports={styleAllSheets};
