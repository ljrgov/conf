// Aliyun DoH JSON API Script
if (typeof $argument === 'undefined') $argument = '{}';
if (typeof $domain === 'undefined') $domain = '';
if (typeof $done === 'undefined') $done = result => console.log('Script completed:', JSON.stringify(result));

async function dnsQuery() {
  try {
    const arguments = JSON.parse($argument);

    const HOST = arguments.HOST || '223.5.5.5';
    const UID = arguments.UID;
    const ID = arguments.ID;
    const SECRET = arguments.SECRET;
    const TS = parseInt(Date.now() / 1000);
    const DOMAIN = $domain;
    const DID = arguments.DID || '';

    if (!UID || !ID || !SECRET || !DOMAIN) {
      throw new Error('Missing required parameters');
    }

    const key = sha256(UID + SECRET + TS + DOMAIN + ID);

    // 创建IPv4和IPv6查询URL
    const DNS_QUERY_IPv4 = `https://${HOST}/resolve?name=${DOMAIN}&type=1&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1${DID ? `&did=${DID}` : ''}`;
    const DNS_QUERY_IPv6 = `https://${HOST}/resolve?name=${DOMAIN}&type=28&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1${DID ? `&did=${DID}` : ''}`;

    // 同时查询IPv4和IPv6
    const [respIPv4, respIPv6] = await Promise.all([
      get(DNS_QUERY_IPv4),
      get(DNS_QUERY_IPv6)
    ]);

    // 解析响应
    const addressesIPv4 = JSON.parse(respIPv4.body);
    const addressesIPv6 = JSON.parse(respIPv6.body);

    // 构建结果
    let result = { ttl: 600 };

    if (Array.isArray(addressesIPv4) && addressesIPv4.length > 0) {
      result.addresses = addressesIPv4;
    } else if (Array.isArray(addressesIPv6) && addressesIPv6.length > 0) {
      result.addresses = addressesIPv6;
    } else {
      result.addresses = null;
    }

    $done(result);
  } catch (e) {
    console.log(e.message);
    $done({});
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    $httpClient.get(url, (error, response, data) => {
      if (error) {
        reject(error);
      } else {
        resolve({ statusCode: response.status, body: data });
      }
    });
  });
}

// SHA256 函数（与原始脚本相同）
function sha256(r){function o(r,o){return r>>>o|r<<32-o}for(var f,a=Math.pow,t=a(2,32),h="length",n="",c=[],e=8*r[h],i=sha256.h=sha256.h||[],s=sha256.k=sha256.k||[],u=s[h],v={},l=2;u<64;l++)if(!v[l]){for(d=0;d<313;d+=l)v[d]=l;i[u]=a(l,.5)*t|0,s[u++]=a(l,1/3)*t|0}for(r+="";r[h]%64-56;)r+="\0";for(d=0;d<r[h];d++){if((f=r.charCodeAt(d))>>8)return;c[d>>2]|=f<<(3-d)%4*8}for(c[c[h]]=e/t|0,c[c[h]]=e,f=0;f<c[h];){for(var g=c.slice(f,f+=16),k=i,i=i.slice(0,8),d=0;d<64;d++){var p=g[d-15],w=g[d-2],A=i[0],C=i[4];(i=[(w=i[7]+(o(C,6)^o(C,11)^o(C,25))+(C&i[5]^~C&i[6])+s[d]+(g[d]=d<16?g[d]:g[d-16]+(o(p,7)^o(p,18)^p>>>3)+g[d-7]+(o(w,17)^o(w,19)^w>>>10)|0))+((o(A,2)^o(A,13)^o(A,22))+(A&i[1]^A&i[2]^i[1]&i[2]))|0].concat(i))[4]=i[4]+w|0}for(d=0;d<8;d++)i[d]=i[d]+k[d]|0}for(d=0;d<8;d++)for(f=3;f+1;f--){var M=i[d]>>8*f&255;n+=(M<16?0:"")+M.toString(16)}return n}

// 运行dnsQuery函数
dnsQuery();