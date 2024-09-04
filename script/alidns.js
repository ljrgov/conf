async function dnsQuery() {
  try {
    const args = JSON.parse($argument);
    const { HOST, TYPE, UID, ID, SECRET, DID } = args;
    const DOMAIN = $domain;
    const TS = Math.floor(Date.now() / 1000);
    const key = sha256(UID + SECRET + TS + DOMAIN + ID);

    const DNS_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&type=${TYPE}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}`;

    const resp = await get(DNS_QUERY);
    const addresses = JSON.parse(resp.body);

    if (addresses.code) {
      throw new Error(`Error Code: ${addresses.code}`);
    }

    if (Array.isArray(addresses)) {
      $done({ addresses, ttl: 600 });
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (e) {
    console.log(`DNS Query Error: ${e.message}`);
    $done({});
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    $httpClient.get(url, (error, response, data) => {
      if (error) {
        reject(error);
      } else {
        resolve({ header: response, body: data });
      }
    });
  });
}

// SHA-256 function
function sha256(input) {
  function rotateRight(n, bits) {
    return (n >>> bits) | (n << (32 - bits));
  }

  const primes = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
  ];

  const H = primes.slice(0, 8).map((p) => Math.sqrt(p) * Math.pow(2, 32) | 0);
  const K = primes.slice(8, 72).map((p) => Math.cbrt(p) * Math.pow(2, 32) | 0);

  input += String.fromCharCode(0x80);

  while (input.length % 64 - 56) input += '\0';

  const words = [];
  for (let i = 0; i < input.length; i += 4) {
    words.push((input.charCodeAt(i) << 24) | (input.charCodeAt(i + 1) << 16) | (input.charCodeAt(i + 2) << 8) | input.charCodeAt(i + 3));
  }

  words.push((input.length - 1) * 8 / Math.pow(2, 32) | 0);
  words.push((input.length - 1) * 8 | 0);

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const state = H.slice(0);

    for (let j = 0; j < 64; j++) {
      const s0 = rotateRight(state[0], 2) ^ rotateRight(state[0], 13) ^ rotateRight(state[0], 22);
      const s1 = rotateRight(state[4], 6) ^ rotateRight(state[4], 11) ^ rotateRight(state[4], 25);

      const t1 = state[7] + s1 + ((state[4] & state[5]) ^ (~state[4] & state[6])) + K[j] + (w[j] = j < 16 ? w[j] : (
        w[j - 16] + (rotateRight(w[j - 15], 7) ^ rotateRight(w[j - 15], 18) ^ (w[j - 15] >>> 3)) + w[j - 7] + (rotateRight(w[j - 2], 17) ^ rotateRight(w[j - 2], 19) ^ (w[j - 2] >>> 10))
      ));

      const t2 = s0 + ((state[0] & state[1]) ^ (state[0] & state[2]) ^ (state[1] & state[2]));
      state[7] = state[6];
      state[6] = state[5];
      state[5] = state[4];
      state[4] = state[3] + t1 | 0;
      state[3] = state[2];
      state[2] = state[1];
      state[1] = state[0];
      state[0] = t1 + t2 | 0;
    }

    for (let j = 0; j < 8; j++) {
      H[j] = H[j] + state[j] | 0;
    }
  }

  return H.map((h) => ('00000000' + h.toString(16)).slice(-8)).join('');
}

dnsQuery();
