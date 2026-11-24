// Minimal standard ZIP (stored entries, UTF-8 names), no remote dependency.
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const header=size=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
export function createZip(files){
  if(!Array.isArray(files)||!files.length||files.length>100)throw Error('ZIP 需要 1–100 个文件。');
  const locals=[],central=[],names=new Set();let offset=0;
  for(const file of files){
    if(typeof file.name!=='string'||!file.name||/[\\/\x00]/.test(file.name)||names.has(file.name))throw Error('ZIP 文件名无效或重复。');
    names.add(file.name);const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):file.data;
    if(!(data instanceof Uint8Array)||name.length>65535||data.length>0xffffffff)throw Error('ZIP 文件内容无效或过大。');
    const crc=crc32(data),local=header(30+name.length),lv=local.view;
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,0x21,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.bytes.set(name,30);
    const entry=header(46+name.length),cv=entry.view;
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);
    cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);entry.bytes.set(name,46);
    locals.push(local.bytes,data);central.push(entry.bytes);offset+=local.bytes.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=header(22),ev=end.view;
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const bytes=new Uint8Array(offset+centralSize+22);let position=0;
  for(const part of [...locals,...central,end.bytes]){bytes.set(part,position);position+=part.length;}
  return bytes;
}
