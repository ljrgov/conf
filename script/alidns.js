async function dnsQuery() {
  const arguments = JSON.parse($argument);
  
  const HOST = arguments.HOST;
  const UID = arguments.UID;
  const ID = arguments.ID;
  const SECRET = arguments.SECRET;
  const DID = arguments.DID;
  const TS = parseInt(Date.now() / 1000);
  const DOMAIN = $domain;

  // 自动判断请求类型
  const TYPE = isIPv6Supported() ? 28 : 1; // 28 为 AAAA，1 为 A
  
  const key = sha256(UID + SECRET + TS + DOMAIN + ID);
  const DNS_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1&did=${DID}&type=${TYPE}`;

  let attempts = 0;
  const maxAttempts = 3;
  let success = false;

  while (attempts < maxAttempts && !success) {
    try {
      const resp = await get(DNS_QUERY);
      const addresses = JSON.parse(resp.body);

      if (addresses.code) {
        throw new Error(addresses.code);
      }

      success = true;
      $done({ addresses, ttl: 300 });
    } catch (e) {
      console.log(e.message);
      attempts++;
      if (attempts === maxAttempts) {
        // 清除 DNS 缓存
        clearDnsCache();
      }
    }
  }

  // 如果达到最大重试次数仍未成功，返回空
  if (!success) {
    clearDnsCache(); // 在此也清除 DNS 缓存
    $done({});
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    // 设置超时时间
    const timeout = setTimeout(() => reject(new Error("请求超时")), 5000); // 5秒超时
    $httpClient.get(url, (error, response, data) => {
      clearTimeout(timeout); // 清除超时
      if (error) reject(error);
      else resolve({ header: response, body: data });
    });
  });
}

function clearDnsCache() {
  // 清除 DNS 缓存的功能
  $dns.clearCache(); // Surge 提供的清除 DNS 缓存的方法
  console.log("DNS 缓存已清除");
}

function isIPv6Supported() {
  // 检查系统是否支持 IPv6
  return typeof $prefs.get("IPv6Enabled") === "undefined" ? false : $prefs.get("IPv6Enabled");
}

// SHA256 实现
function sha256(r) {
  function o(r, o) { return r >>> o | r << (32 - o) }
  for (var f, a = Math.pow, t = a(2, 32), h = "length", n = "", c = [], e = 8 * r[h], i = sha256.h = sha256.h || [], s = sha256.k = sha256.k || [], u = s[h], v = {}, l = 2; u < 64; l++)
    if (!v[l]) {
      for (d = 0; d < 313; d += l) v[d] = l; 
      i[u] = a(l, .5) * t | 0, s[u++] = a(l, 1 / 3) * t | 0 
    }
  for (r += ""; r[h] % 64 - 56;) r += "\0"; 
  for (d = 0; d < r[h]; d++) {
    if ((f = r.charCodeAt(d)) >> 8) return; 
    c[d >> 2] |= f << (3 - d) % 4 * 8 
  }
  for (c[c[h]] = e / t | 0, c[c[h]] = e, f = 0; f < c[h];) {
    for (var g = c.slice(f, f += 16), k = i, i = i.slice(0, 8), d = 0; d < 64; d++) {
      var p = g[d - 15], w = g[d - 2], A = i[0], C = i[4];
      (i = [(w = i[7] + (o(C, 6) ^ o(C, 11) ^ o(C, 25)) + (C & i[5] ^ ~C & i[6]) + s[d] + (g[d] = d < 16 ? g[d] : g[d - 16] + (o(p, 7) ^ o(p, 18) ^ p >>> 3) + g[d - 7] + (o(w, 17) ^ o(w, 19) ^ w >>> 10) | 0)) + ((o(A, 2) ^ o(A, 13) ^ o(A, 22)) + (A & i[1] ^ A & i[2] ^ i[1] & i[2])) | 0).concat(i))[4] = i[4] + w | 0 
    }
    for (d = 0; d < 8; d++) i[d] = i[d] + k[d] | 0 
  }
  for (d = 0; d < 8; d++) for (f = 3; f + 1; f--) {
    var M = i[d] >> 8 * f & 255;
    n += (M < 16 ? 0 : "") + M.toString(16) 
  }
  return n;
}

dnsQuery();