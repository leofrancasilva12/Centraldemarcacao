// QR Code encoder (byte mode, versions 1-6, EC L/M/Q/H)
export const QR = (function(){
  const EC_TABLE = {
    1:{L:[7,[[1,19]]],   M:[10,[[1,16]]],  Q:[13,[[1,13]]],          H:[17,[[1,9]]]},
    2:{L:[10,[[1,34]]],  M:[16,[[1,28]]],  Q:[22,[[1,22]]],          H:[28,[[1,16]]]},
    3:{L:[15,[[1,55]]],  M:[26,[[1,44]]],  Q:[18,[[2,17]]],          H:[22,[[2,13]]]},
    4:{L:[20,[[1,80]]],  M:[18,[[2,32]]],  Q:[26,[[2,24]]],          H:[16,[[4,9]]]},
    5:{L:[26,[[1,108]]], M:[24,[[2,43]]],  Q:[18,[[2,15],[2,16]]],   H:[22,[[2,11],[2,12]]]},
    6:{L:[18,[[2,68]]],  M:[16,[[4,27]]],  Q:[24,[[4,19]]],          H:[28,[[4,15]]]},
  };
  const ALIGN = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34]};
  const ECL_BITS = {L:1, M:0, Q:3, H:2};

  // ---- GF(256) ----
  const EXP = new Array(512), LOG = new Array(256);
  (function(){
    let x = 1;
    for(let i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x & 0x100) x ^= 0x11D; }
    for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
  })();
  const mul = (a,b) => (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]];

  function genPoly(n){
    let poly = [1];
    for(let i=0;i<n;i++){
      const next = new Array(poly.length+1).fill(0);
      for(let j=0;j<poly.length;j++){
        next[j]   ^= poly[j];
        next[j+1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen){
    const gen = genPoly(ecLen);
    const res = new Array(data.length + ecLen).fill(0);
    for(let i=0;i<data.length;i++) res[i] = data[i];
    for(let i=0;i<data.length;i++){
      const coef = res[i];
      if(coef !== 0){
        for(let j=0;j<gen.length;j++) res[i+j] ^= mul(gen[j], coef);
      }
    }
    return res.slice(data.length);
  }

  function utf8Bytes(str){
    const out = [];
    for(const ch of str){
      let cp = ch.codePointAt(0);
      if(cp < 0x80) out.push(cp);
      else if(cp < 0x800){ out.push(0xC0|(cp>>6), 0x80|(cp&0x3F)); }
      else if(cp < 0x10000){ out.push(0xE0|(cp>>12), 0x80|((cp>>6)&0x3F), 0x80|(cp&0x3F)); }
      else { out.push(0xF0|(cp>>18), 0x80|((cp>>12)&0x3F), 0x80|((cp>>6)&0x3F), 0x80|(cp&0x3F)); }
    }
    return out;
  }

  function capacityBytes(version, ecl){
    const [ecPerBlock, groups] = EC_TABLE[version][ecl];
    let total = 0;
    for(const [blocks, dataCw] of groups) total += blocks*dataCw;
    return total;
  }

  function pickVersion(byteLen, ecl){
    for(let v=1; v<=6; v++){
      // mode(4) + count(8) + data*8 + terminator handled by capacity check
      if(byteLen + 2 <= capacityBytes(v, ecl)) return v;
    }
    return null;
  }

  function buildCodewords(bytes, version, ecl){
    const [ecPerBlock, groups] = EC_TABLE[version][ecl];
    const totalData = capacityBytes(version, ecl);

    // bit stream
    const bits = [];
    const push = (val, len) => { for(let i=len-1;i>=0;i--) bits.push((val>>i)&1); };
    push(4, 4);                 // byte mode
    push(bytes.length, 8);      // count indicator (versions 1-9)
    bytes.forEach(b => push(b, 8));
    // terminator
    const cap = totalData*8;
    for(let i=0; i<4 && bits.length<cap; i++) bits.push(0);
    while(bits.length % 8 !== 0) bits.push(0);
    // pad bytes
    const padBytes = [0xEC, 0x11];
    let p = 0;
    while(bits.length < cap){ push(padBytes[p%2], 8); p++; }

    const dataCw = [];
    for(let i=0;i<bits.length;i+=8){
      let b = 0;
      for(let j=0;j<8;j++) b = (b<<1) | bits[i+j];
      dataCw.push(b);
    }

    // split into blocks
    const dataBlocks = [], ecBlocks = [];
    let offset = 0;
    for(const [blocks, cwPerBlock] of groups){
      for(let b=0;b<blocks;b++){
        const chunk = dataCw.slice(offset, offset+cwPerBlock);
        offset += cwPerBlock;
        dataBlocks.push(chunk);
        ecBlocks.push(rsEncode(chunk, ecPerBlock));
      }
    }

    // interleave
    const out = [];
    const maxData = Math.max(...dataBlocks.map(b => b.length));
    for(let i=0;i<maxData;i++)
      for(const blk of dataBlocks) if(i < blk.length) out.push(blk[i]);
    for(let i=0;i<ecPerBlock;i++)
      for(const blk of ecBlocks) out.push(blk[i]);
    return out;
  }

  function buildMatrix(version, ecl, codewords){
    const size = version*4 + 17;
    const m = Array.from({length:size}, () => new Array(size).fill(0));
    const rsv = Array.from({length:size}, () => new Array(size).fill(false));

    function setRange(r0,c0,r1,c1){
      for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++)
        if(r>=0&&c>=0&&r<size&&c<size) rsv[r][c]=true;
    }
    function finder(r,c){
      for(let i=0;i<7;i++) for(let j=0;j<7;j++){
        const ring = (i===0||i===6||j===0||j===6);
        const core = (i>=2&&i<=4&&j>=2&&j<=4);
        m[r+i][c+j] = (ring||core) ? 1 : 0;
      }
      setRange(r-1,c-1,r+7,c+7);
    }
    finder(0,0); finder(0,size-7); finder(size-7,0);

    // timing
    for(let i=8;i<size-8;i++){
      const v = (i%2===0) ? 1 : 0;
      m[6][i]=v; rsv[6][i]=true;
      m[i][6]=v; rsv[i][6]=true;
    }

    // alignment
    const ap = ALIGN[version];
    for(const r of ap) for(const c of ap){
      if((r<=8&&c<=8) || (r<=8&&c>=size-9) || (r>=size-9&&c<=8)) continue;
      for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++){
        m[r+i][c+j] = (Math.max(Math.abs(i),Math.abs(j)) !== 1) ? 1 : 0;
        rsv[r+i][c+j] = true;
      }
    }

    // dark module + format reserve
    m[size-8][8] = 1;
    setRange(size-8,8,size-1,8);
    setRange(8,0,8,8);
    setRange(0,8,8,8);
    setRange(8,size-8,8,size-1);

    // data placement
    const totalBits = codewords.length*8;
    let dir = -1, row = size-1, bitIdx = 0;
    for(let col = size-1; col > 0; col -= 2){
      if(col === 6) col--;
      while(true){
        for(let c=0;c<2;c++){
          const cc = col - c;
          if(!rsv[row][cc]){
            let bit = 0;
            if(bitIdx < totalBits) bit = (codewords[bitIdx>>3] >> (7-(bitIdx&7))) & 1;
            bitIdx++;
            m[row][cc] = bit;
          }
        }
        row += dir;
        if(row < 0 || row >= size){ row -= dir; dir = -dir; break; }
      }
    }
    return {m, rsv, size};
  }

  const MASKS = [
    (r,c)=>((r+c)%2)===0,
    (r,c)=>(r%2)===0,
    (r,c)=>(c%3)===0,
    (r,c)=>((r+c)%3)===0,
    (r,c)=>((Math.floor(r/2)+Math.floor(c/3))%2)===0,
    (r,c)=>(((r*c)%2)+((r*c)%3))===0,
    (r,c)=>((((r*c)%2)+((r*c)%3))%2)===0,
    (r,c)=>((((r+c)%2)+((r*c)%3))%2)===0,
  ];

  function penalty(m, size){
    let score = 0;
    // rule 1: runs of 5+
    for(let r=0;r<size;r++){
      let run=1;
      for(let c=1;c<size;c++){
        if(m[r][c]===m[r][c-1]) run++;
        else { if(run>=5) score += 3+(run-5); run=1; }
      }
      if(run>=5) score += 3+(run-5);
    }
    for(let c=0;c<size;c++){
      let run=1;
      for(let r=1;r<size;r++){
        if(m[r][c]===m[r-1][c]) run++;
        else { if(run>=5) score += 3+(run-5); run=1; }
      }
      if(run>=5) score += 3+(run-5);
    }
    // rule 2: 2x2 blocks
    for(let r=0;r<size-1;r++) for(let c=0;c<size-1;c++){
      const v=m[r][c];
      if(v===m[r][c+1] && v===m[r+1][c] && v===m[r+1][c+1]) score += 3;
    }
    // rule 3: finder-like patterns
    const p1=[1,0,1,1,1,0,1,0,0,0,0], p2=[0,0,0,0,1,0,1,1,1,0,1];
    function match(arr, pat){
      for(let i=0;i<pat.length;i++) if(arr[i]!==pat[i]) return false;
      return true;
    }
    for(let r=0;r<size;r++) for(let c=0;c<=size-11;c++){
      const row = m[r].slice(c,c+11);
      if(match(row,p1)||match(row,p2)) score += 40;
    }
    for(let c=0;c<size;c++) for(let r=0;r<=size-11;r++){
      const col=[]; for(let k=0;k<11;k++) col.push(m[r+k][c]);
      if(match(col,p1)||match(col,p2)) score += 40;
    }
    // rule 4: deviation of dark-module ratio from 50%, in 5% steps
    let dark=0;
    for(let r=0;r<size;r++) for(let c=0;c<size;c++) dark += m[r][c];
    const k = Math.abs(Math.ceil((dark*100/(size*size))/5) - 10);
    score += k*10;
    return score;
  }

  function formatBits(ecl, mask){
    let data = (ECL_BITS[ecl]<<3) | mask;
    let rem = data;
    for(let i=0;i<10;i++) rem = (rem<<1) ^ (((rem>>9)&1) ? 0x537 : 0);
    return ((data<<10) | rem) ^ 0x5412;
  }

  function placeFormat(m, size, ecl, mask){
    const bits = formatBits(ecl, mask);
    for(let i=0;i<15;i++){
      const b = (bits>>i)&1;
      // copy 1: vertical beside top-left finder, then horizontal
      if(i < 6)      m[i][8]   = b;
      else if(i < 8) m[i+1][8] = b;
      else if(i === 8) m[8][7] = b;
      else           m[8][14-i] = b;
      // copy 2: horizontal beside top-right finder, then vertical at bottom-left
      if(i < 8) m[8][size-1-i] = b;
      else      m[size-15+i][8] = b;
    }
    m[size-8][8] = 1;
  }

  function encode(text, ecl){
    ecl = ecl || "M";
    const bytes = utf8Bytes(text);
    const version = pickVersion(bytes.length, ecl);
    if(!version) return null;
    const cw = buildCodewords(bytes, version, ecl);
    const {m, rsv, size} = buildMatrix(version, ecl, cw);

    let best = null;
    for(let mask=0; mask<8; mask++){
      const test = m.map(row => row.slice());
      for(let r=0;r<size;r++) for(let c=0;c<size;c++)
        if(!rsv[r][c] && MASKS[mask](r,c)) test[r][c] ^= 1;
      placeFormat(test, size, ecl, mask);
      const p = penalty(test, size);
      if(!best || p < best.score) best = {score:p, matrix:test, mask};
    }
    return {size, modules: best.matrix, version, mask: best.mask};
  }

  return {encode, capacityBytes, pickVersion};
})();
