// 主函数：发起 DNS 查询
async function dnsQuery() {
  try {
    // 解析传入的参数
    const arguments = JSON.parse($argument);
    const HOST = arguments.HOST;
    const UID = arguments.UID;
    const ID = arguments.ID;
    const SECRET = arguments.SECRET;
    const DID = arguments.DID;
    const DOMAIN = $domain;
    const TYPE = arguments.TYPE; // 保留类型参数

    // 获取当前时间戳（秒）
    const TS = parseInt(Date.now() / 1000);

    // 生成签名 key
    const key = sha256(UID + SECRET + TS + DOMAIN + ID);

    // 构造 DNS 请求 URL
    const DNS_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&type=${TYPE}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1&did=${DID}`;

    // 发起请求并解析返回结果
    const resp = await get(DNS_QUERY);
    const addresses = JSON.parse(resp.body);

    // 检查返回结果的状态码
    if (addresses.code) {
      throw new Error(addresses.code); // 如果有错误，抛出异常
    }

    // 成功时返回结果，并设置 TTL 为 300 秒（5 分钟）
    $done({ addresses: addresses.data || [], ttl: 300 });
  } catch (e) {
    console.log(e.message); // 输出错误信息
    fallbackToLocalDNS();   // 如果出错，执行兜底策略
  }
}

// 兜底策略：如果阿里公共 DNS 查询失败，使用本地 DNS 进行解析
function fallbackToLocalDNS() {
  $done({ addresses: [], ttl: 60 }); // 使用本地 DNS 并设置 TTL 为 60 秒
}

// HTTP GET 请求的封装
function get(url) {
  return new Promise((resolve, reject) => {
    $httpClient.get(url, (error, response, data) => {
      if (error) reject(error);   // 处理错误
      else resolve({ header: response, body: data }); // 成功返回数据
    });
  });
}

// SHA256 哈希函数
function sha256(input) {
  function rotateRight(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const words = [];
  let messageLength = input.length;
  const bitLength = messageLength * 8;

  for (let i = 0; i < messageLength; ++i) {
    words[i >> 2] |= input.charCodeAt(i) << (24 - (i % 4) * 8);
  }

  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[((bitLength + 64 >> 9) << 4) + 15] = bitLength;

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  for (let i = 0; i < words.length; i += 16) {
    const W = words.slice(i, i + 16);
    for (let j = 16; j < 64; ++j) {
      const s0 = rotateRight(W[j - 15], 7) ^ rotateRight(W[j - 15], 18) ^ (W[j - 15] >>> 3);
      const s1 = rotateRight(W[j - 2], 17) ^ rotateRight(W[j - 2], 19) ^ (W[j - 2] >>> 10);
      W[j] = W[j - 16] + s0 + W[j - 7] + s1 | 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let j = 0; j < 64; ++j) {
      const S1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = h + S1 + ch + K[j] + W[j] | 0;
      const S0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = S0 + maj | 0;

      h = g;
      g = f;
      f = e;
      e = d + temp1 | 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 | 0;
    }

    H[0] = H[0] + a | 0;
    H[1] = H[1] + b | 0;
    H[2] = H[2] + c | 0;
    H[3] = H[3] + d | 0;
    H[4] = H[4] + e | 0;
    H[5] = H[5] + f | 0;
    H[6] = H[6] + g | 0;
    H[7] = H[7] + h | 0;
  }

  return H.map(x => ('00000000' + x.toString(16)).slice(-8)).join('');
}

// 启动 DNS 查询
dnsQuery();


