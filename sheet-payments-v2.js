const C={
  black:{red:.025,green:.028,blue:.035},
  panel:{red:.07,green:.075,blue:.09},
  panel2:{red:.095,green:.10,blue:.12},
  red:{red:.55,green:.02,blue:.04},
  red2:{red:.22,green:.015,blue:.025},
  white:{red:.96,green:.96,blue:.98},
  muted:{red:.62,green:.64,blue:.69},
  green:{red:.15,green:.72,blue:.38},
  amber:{red:.95,green:.62,blue:.12}
};
const rgb=x=>({rgbColor:x});
const range=(sid,r1,r2,c1,c2)=>({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
const fmt=(sid,r1,r2,c1,c2,format)=>({repeatCell:{range:range(sid,r1,r2,c1,c2),cell:{userEnteredFormat:format},fields:'userEnteredFormat'}});
const width=(sid,i,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:px},fields:'pixelSize'}});
const height=(sid,r1,r2,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:'ROWS',startIndex:r1,endIndex:r2},properties:{pixelSize:px},fields:'pixelSize'}});

async function stylePayments(sheets,spreadsheetId,title='Weekbetalingen'){
  const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties(sheetId,title)'});
  const p=(meta.data.sheets||[]).map(s=>s.properties).find(x=>x.title===title);
  if(!p) return;
  const sid=p.sheetId;
  const requests=[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{hideGridlines:true,frozenRowCount:1},tabColorStyle:rgb(C.red)},fields:'gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle'}},
    fmt(sid,0,2000,0,10,{backgroundColorStyle:rgb(C.black),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE'}),
    fmt(sid,0,1,0,10,{backgroundColorStyle:rgb(C.red2),textFormat:{foregroundColorStyle:rgb(C.white),bold:true,fontSize:11},horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',borders:{bottom:{style:'SOLID_THICK',colorStyle:rgb(C.red)}}}),
    fmt(sid,1,2000,0,10,{backgroundColorStyle:rgb(C.panel),textFormat:{foregroundColorStyle:rgb(C.white),fontSize:10},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP',borders:{bottom:{style:'SOLID',colorStyle:rgb(C.panel2)}}}),
    fmt(sid,1,2000,0,1,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
    fmt(sid,1,2000,1,2,{textFormat:{bold:true},horizontalAlignment:'CENTER'}),
    fmt(sid,1,2000,4,5,{textFormat:{foregroundColorStyle:rgb(C.green),bold:true},horizontalAlignment:'RIGHT',numberFormat:{type:'CURRENCY',pattern:'$#,##0'}}),
    fmt(sid,1,2000,5,6,{textFormat:{foregroundColorStyle:rgb(C.green),bold:true},horizontalAlignment:'CENTER'}),
    fmt(sid,1,2000,6,8,{textFormat:{foregroundColorStyle:rgb(C.muted),fontSize:9}}),
    fmt(sid,1,2000,8,9,{textFormat:{foregroundColorStyle:rgb(C.amber)}}),
    height(sid,0,1,36),
    height(sid,1,2000,30),
    width(sid,0,205),
    width(sid,1,110),
    width(sid,2,180),
    width(sid,3,220),
    width(sid,4,125),
    width(sid,5,125),
    width(sid,6,205),
    width(sid,7,205),
    width(sid,8,190),
    width(sid,9,300)
  ];
  await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests}});
}

module.exports={stylePayments};
