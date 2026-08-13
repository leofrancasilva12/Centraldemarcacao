// Linear barcode encoders: Code 128 (subset B) and Code 39.
// Both return an array of bar/space widths as a binary string ("1" = bar).
export const BARCODE = (function(){

  const C128_PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];
  const C128_START_B = 104;
  const C128_STOP = 106;

  // Expand a width pattern ("212222") into bits, starting with a bar.
  function widthsToBits(pattern){
    let bits = "";
    for(let i=0;i<pattern.length;i++){
      const n = parseInt(pattern[i], 10);
      bits += (i % 2 === 0 ? "1" : "0").repeat(n);
    }
    return bits;
  }

  function code128B(text){
    const values = [];
    for(const ch of text){
      const code = ch.charCodeAt(0);
      if(code < 32 || code > 126) return null;   // outside subset B
      values.push(code - 32);
    }
    let sum = C128_START_B;
    values.forEach((v,i) => { sum += v * (i+1); });
    const checksum = sum % 103;

    const seq = [C128_START_B, ...values, checksum, C128_STOP];
    let bits = "";
    seq.forEach(v => { bits += widthsToBits(C128_PATTERNS[v]); });
    return bits;
  }

  // Code 39: 9 elements per character (bar/space alternating, starting with a bar),
  // n = narrow (1 module), w = wide (3 modules).
  const C39_MAP = {
    "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
    "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
    "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn",
    "F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
    "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn",
    "P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
    "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn",
    "Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn",
    "/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
  };

  function code39(text){
    const seq = "*" + text.toUpperCase() + "*";
    let bits = "";
    for(const ch of seq){
      const pat = C39_MAP[ch];
      if(!pat) return null;
      for(let i=0;i<pat.length;i++){
        const width = pat[i] === "w" ? 3 : 1;
        bits += (i % 2 === 0 ? "1" : "0").repeat(width);
      }
      bits += "0";   // narrow inter-character gap
    }
    return bits;
  }

  return {code128B, code39};
})();
