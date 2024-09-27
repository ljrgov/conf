const CACHE_TTL = 300; // 5分钟
const DNS_TIMEOUT = 3000; // 3秒
const IP_TEST_TIMEOUT = 1000; // IP测试超时时间
const MAX_TEST_IPS = 3; // 最多测试的IP数量

async function dnsQuery() {
  if ($eventType === "network-changed") {
    $surge.setDnsCache({}, {});
    return $done({});
  }

  try {
    const arguments = JSON.parse($argument);
    const DOMAIN = $domain;
    const TYPE = arguments.TYPE || "1"; // 默认为 A 记录 (IPv4)

    // 检查 Surge DNS 缓存
    const cachedResult = $surge.getDnsCache(DOMAIN)[TYPE === "28" ? "AAAA" : "A"];
    if (cachedResult && cachedResult.length > 0) {
      return $done({ addresses: cachedResult, ttl: CACHE_TTL });
    }

    const HOST = arguments.HOST;
    const UID = arguments.UID;
    const ID = arguments.ID;
    const SECRET = arguments.SECRET;
    const TS = parseInt(Date.now() / 1000);
    const DID = arguments.DID;
    const key = sha256(UID + SECRET + TS + DOMAIN + ID);

    const DNS_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1&did=${DID}&type=${TYPE}`;

    let addresses = await retryDnsQuery(DNS_QUERY);

    // IP 优化
    const optimizedAddresses = await optimizeIPs(addresses, TYPE);

    // 更新 Surge DNS 缓存
    $surge.setDnsCache({
      [DOMAIN]: { [TYPE === "28" ? "AAAA" : "A"]: optimizedAddresses }
    }, { ttl: CACHE_TTL });

    $done({ addresses: optimizedAddresses, ttl: CACHE_TTL });
  } catch (e) {
    console.log(`阿里云 DNS 查询错误: ${e.message}`);
    // 使用 Surge 的常规 DNS
    $done({});
  }
}

async function retryDnsQuery(query, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await Promise.race([
        get(query),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DNS 查询超时')), DNS_TIMEOUT))
      ]);

      if (resp.statusCode !== 200) {
        throw new Error(`HTTP 错误: ${resp.statusCode}`);
      }

      const addresses = JSON.parse(resp.body);

      if (addresses.code) {
        throw new Error(addresses.code);
      }

      return addresses;
    } catch (e) {
      console.log(`DNS 查询重试 ${i + 1}/${maxRetries}: ${e.message}`);
      if (i === maxRetries - 1) throw e;
    }
  }
}

async function optimizeIPs(addresses, type) {
  try {
    const addressesToTest = addresses.slice(0, MAX_TEST_IPS);
    const results = await Promise.all(addressesToTest.map(async (ip) => {
      const startTime = Date.now();
      try {
        const testUrl = type === "28" ? `http://[${ip}]` : `http://${ip}`;
        await $httpClient.head(testUrl, { timeout: IP_TEST_TIMEOUT });
        return { ip, latency: Date.now() - startTime };
      } catch (e) {
        return { ip, latency: Infinity };
      }
    }));
    
    const sortedAddresses = results.sort((a, b) => a.latency - b.latency).map(result => result.ip);
    return sortedAddresses.concat(addresses.slice(MAX_TEST_IPS));
  } catch (e) {
    console.log(`IP 优化错误: ${e.message}`);
    return addresses;
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    $httpClient.get(url, (error, response, data) => {
      if (error) reject(error);
      else resolve({ statusCode: response.status, body: data });
    });
  });
}

function sha256(r) {function o(r,o){return r>>>o|r<<32-o}for(var f,a=Math.pow,t=a(2,32),h="length",n="",c=[],e=8*r[h],i=sha256.h=sha256.h||[],s=sha256.k=sha256.k||[],u=s[h],v={},l=2;u<64;l++)if(!v[l]){for(d=0;d<313;d+=l)v[d]=l;i[u]=a(l,.5)*t|0,s[u++]=a(l,1/3)*t|0}for(r+="";r[h]%64-56;)r+="\0";for(d=0;d<r[h];d++){if((f=r.charCodeAt(d))>>8)return;c[d>>2]|=f<<(3-d)%4*8}for(c[c[h]]=e/t|0,c[c[h]]=e,f=0;f<c[h];){for(var g=c.slice(f,f+=16),k=i,i=i.slice(0,8),d=0;d<64;d++){var p=g[d-15],w=g[d-2],A=i[0],C=i[4];(i=[(w=i[7]+(o(C,6)^o(C,11)^o(C,25))+(C&i[5]^~C&i[6])+s[d]+(g[d]=d<16?g[d]:g[d-16]+(o(p,7)^o(p,18)^p>>>3)+g[d-7]+(o(w,17)^o(w,19)^w>>>10)|0))+((o(A,2)^o(A,13)^o(A,22))+(A&i[1]^A&i[2]^i[1]&i[2]))|0].concat(i))[4]=i[4]+w|0}for(d=0;d<8;d++)i[d]=i[d]+k[d]|0}for(d=0;d<8;d++)for(f=3;f+1;f--){var M=i[d]>>8*f&255;n+=(M<16?0:"")+M.toString(16)}return n}

dnsQuery();
