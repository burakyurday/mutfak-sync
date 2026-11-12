import{signDownload,verifyDownload}from'./drive.ts';

function assert(value:boolean,message:string){if(!value)throw new Error(message)}

Deno.test('download ticket roundtrip and tamper rejection',async()=>{
 Deno.env.set('HUB_DOWNLOAD_SECRET','test-only-secret-with-more-than-32-bytes');
 const token=await signDownload({fileId:'file-1',userId:'user-1',mode:'download',exp:2_000_000_000});
 const payload=await verifyDownload(token);
 assert(payload.fileId==='file-1'&&payload.userId==='user-1'&&payload.mode==='download'&&payload.exp===2_000_000_000,'ticket roundtrip failed');
 let rejected=false;try{await verifyDownload(`${token.slice(0,-1)}x`);}catch{rejected=true}assert(rejected,'tampered ticket accepted');
});
