async function dnsQuery() {
    try {
        const arguments = JSON.parse($argument);

        const HOST = arguments.HOST;
        const TYPE = arguments.TYPE; // 可以是 1 (A) 或 28 (AAAA)
        const UID = arguments.UID;
        const ID = arguments.ID;
        const SECRET = arguments.SECRET;
        const TS = parseInt(Date.now() / 1000);
        const DOMAIN = $domain;
        const DID = arguments.DID;
        const key = sha256(UID + SECRET + TS + DOMAIN + ID);

        // 首先查询 A 记录 (IPv4)
        const A_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1&did=${DID}&type=1`;
        const aResponse = await get(A_QUERY);

        const aAddresses = JSON.parse(aResponse.body);
        
        // 检查 A 记录结果
        if (aAddresses.code) {
            throw new Error(aAddresses.code);
        }
        
        // 如果有 A 记录，则返回
        if (aAddresses.Answer && aAddresses.Answer.length > 0) {
            return $done({ addresses: aAddresses.Answer, ttl: 600 });
        }

        // 如果 A 记录结果为空，则查询 AAAA 记录 (IPv6)
        const AAAA_QUERY = `https://${HOST}/resolve?name=${DOMAIN}&uid=${UID}&ak=${ID}&key=${key}&ts=${TS}&short=1&did=${DID}&type=28`;
        const aaaResponse = await get(AAAA_QUERY);

        const aaaAddresses = JSON.parse(aaaResponse.body);
        
        // 检查 AAAA 记录结果
        if (aaaAddresses.code) {
            throw new Error(aaaAddresses.code);
        }

        // 返回 AAAA 记录结果
        if (aaaAddresses.Answer && aaaAddresses.Answer.length > 0) {
            return $done({ addresses: aaaAddresses.Answer, ttl: 600 });
        }

        // 如果两个都没有，返回空
        return $done({ addresses: [], ttl: 600 });

    } catch (e) {
        console.log(e.message);
        // 请求超时的处理
        // 这里可以调用 Surge 的内置功能来清除 DNS 缓存
        // 这取决于 Surge 的实现，假设有一个方法 $clearDNSCache() 来清除缓存
        // $clearDNSCache();

    } finally {
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

// SHA-256 加密函数
function sha256(r) {
    function o(r, o) { return r >>> o | r << (32 - o); }
    for (var f, a = Math.pow, t = a(2, 32), h = "length", n = "", c = [], e = 8 * r[h], i = sha256.h = sha256.h || [], s = sha256.k = sha256.k || [], u = s[h], v = {}, l = 2; u < 64; l++) {
        if (!v[l]) {
            for (d = 0; d < 313; d += l) v[d] = l;
            i[u] = a(l, .5) * t | 0;
            s[u++] = a(l, 1 / 3) * t | 0;
        }
    }
    for (r += ""; r[h] % 64 - 56;) r += "\0";
    for (d = 0; d < r[h]; d++) {
        if ((f = r.charCodeAt(d)) >> 8) return;
        c[d >> 2] |= f << (24 - d % 4 * 8);
    }
    for (c[c[h]] = e / t | 0, c[c[h]] = e, f = 0; f < c[h];) {
        for (var g = c.slice(f, f += 16), k = i, i = i.slice(0, 8), d = 0; d < 64; d++) {
            var p = g[d - 15], w = g[d - 2], A = i[0], C = i[4];
            (i = [
                (w = i[7] + (o(C, 6) ^ o(C, 11) ^ o(C, 25)) + (C & i[5] ^ ~C & i[6]) + s[d] + (g[d] = d < 16 ? g[d] : g[d - 16] + (o(p, 7) ^ o(p, 18) ^ p >>> 3) + g[d - 7] + (o(w, 17) ^ o(w, 19) ^ w >>> 10) | 0)) + ((o(A, 2) ^ o(A, 13) ^ o(A, 22)) + (A & i[1] ^ A & i[2] ^ i[1] & i[2])) | 0
            ).concat(i))[4] = i[4] + w | 0;
        }
        for (d = 0; d < 8; d++) i[d] = i[d] + k[d] | 0;
    }
    for (d = 0; d < 8; d++) for (f = 3; f + 1; f--) {
        var M = i[d] >> 8 * f & 255;
        n += (M < 16 ? 0 : "") + M.toString(16);
    }
    return n;
}

dnsQuery();