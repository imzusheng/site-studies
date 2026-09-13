export const repository='jdpulgarin/Tennis-MoCap';
export const commit='9af88bb4df4e78b22127719744fdca993ced2733';
export const sources=[
 {kind:'forehand',filename:'lvargas_Derecha_4seg.bvh',gitBlobSHA1:'1296f406b5b623d919624496420cbb92a5962fda',frames:479},
 {kind:'backhand',filename:'adorozco_Reves_8seg.bvh',gitBlobSHA1:'12d932e3af32d66360f7ed6ce2cdc0bd50554e98',frames:795}
].map(s=>({...s,license:'CC-BY-SA-3.0',url:`https://raw.githubusercontent.com/${repository}/${commit}/data/${s.filename}`}));
