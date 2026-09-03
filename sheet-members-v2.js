const {stylePayments}=require('./sheet-payments-v2');

const C={
  black:{red:.025,green:.028,blue:.035},
  panel:{red:.07,green:.075,blue:.09},
  panel2:{red:.095,green:.10,blue:.12},
  red:{red:.55,green:.02,blue:.04},
  red2:{red:.22,green:.015,blue:.025},
  white:{red:.96,green:.96,blue:.98},
  muted:{red:.62,green:.64,blue:.69},
  green:{red:.10,green:.52,blue:.27},
  greenDark:{red:.035,green:.18,blue:.09},
  danger:{red:.78,green:.08,blue:.10},
  dangerDark:{red:.22,green:.025,blue:.035}
};
const rgb=x=>({rgbColor:x});
const range=(sid,r1,r2,c1,c2)=>({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
const fmt=(sid,r1,r2,c1,c2,format)=>({repeatCell:{range:range(sid,r1,r2,c1,c2),cell:{userEnteredFormat:format},fields:'userEnteredFormat'}});
const width=(sid,i,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:px},fields:'pixelSize'}});
const height=(sid,r1,r2,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'ROWS',startIndex:r1,endIndex:r2},properties:{pixelSize:px},fields:'pixelSize'}});

async function styleMembers(sheets,spreadsheetId,title='Leden'){
  const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties(sheetId,title)'});
  const p=(meta.data.sheets||[]).map(s=>s.properties).find(x=>x.title===title);
  if(!p) return;
  const sid=p.sheetId;
  const requests=[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{hideGridlines:true,frozenRowCount:1},tabColorStyle:rgb(C.red)},fields:'gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle'}},
    fmt(sid,0,1000,0,7,{backgroundColorStyle:rgb(C.black),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE'}),
    fmt(sid,0,1,0,7,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:11},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',borders:{bottom:{style:'SOLID_THICK',colorStyle:rgb(C.red)}}}),
    fmt(sid,1,1000,0,7,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP',borders:{bottom:{style:'SOLID',colorStyle:rgb(C.panel2)}}}),
    fmt(sid,1,1000,0,1,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
    fmt(sid,1,1000,4,5,{textFormat:{bold:true},horizontalAlignment:'CENTER'}),
    fmt(sid,1,1000,5,6,{textFormat:{foregroundColorStyle:rgb(C.muted)},horizontalAlignment:'CENTER'}),
    fmt(sid,1,1000,6,7,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
    height(sid,0,1,34),
    height(sid,1,1000,30),
    width(sid,0,175),
    width(sid,1,210),
    width(sid,2,180),
    width(sid,3,330),
    width(sid,4,145),
    width(sid,5,135),
    width(sid,6,210),
    {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,4,5)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'BETAALD'}]},format:{backgroundColorStyle:rgb(C.greenDark),textFormat:{foregroundColorStyle:rgb(C.green),bold:true}}}},index:0}},
    {addConditionalFormatRule:{rule:{ranges:[range(sid,1,1000,4,5)],booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'OPENSTAAND'}]},format:{backgroundColorStyle:rgb(C.dangerDark),textFormat:{foregroundColorStyle:rgb(C.danger),bold:true}}}},index:0}}
  ];
  await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests}});
  await stylePayments(sheets,spreadsheetId,'Weekbetalingen');
}

module.exports={styleMembers};
