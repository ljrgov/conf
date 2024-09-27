const cacheDuration = 60 * 5; // 缓存持续时间
const maxRetries = 3; // 最大重试次数
const timeout = 5000; // 超时时间

let cache = {}; // 缓存对象

// 清除DNS缓存的函数
function clearDnsCache() {
    $surge.clearDNSCache();
}

// 计算哈希值的函数
function calculateKey(uid, accessKeySecret, ts, qname, accessKeyID) {
    return sha256(uid + accessKeySecret + ts + qname + accessKeyID);
}

// 发送DNS请求的函数
async function sendDnsRequest(domain, type, uid, ak, secret, did) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const key = calculateKey(uid, secret, timestamp, domain, ak);

    const url = `https://${HOST}/resolve?name=${domain}&type=${type}&uid=${uid}&ak=${ak}&key=${key}&ts=${timestamp}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await $http.get(url, { timeout });
        if (response.status === 200) {
            return response.data;
        }
        if (attempt === maxRetries - 1) {
            clearDnsCache(); // 超过最大重试次数后清除缓存
        }
    }
}

// 处理请求的主函数
async function main() {
    const { HOST, UID, ID, SECRET, DID, TYPE } = JSON.parse($argument); // 解析参数

    const queries = [{ domain: $input, type: TYPE }]; // 假设只有一个查询
    let results = [];

    for (const { domain, type } of queries) {
        if (cache[domain]) {
            results.push(cache[domain]);
            continue;
        }

        const dnsResult = await sendDnsRequest(domain, type, UID, ID, SECRET, DID);
        if (dnsResult) {
            cache[domain] = dnsResult;
            results.push(dnsResult);
            // 清除过期缓存
            setTimeout(() => { delete cache[domain]; }, cacheDuration * 1000);
        }
    }

    // 返回处理结果
    return JSON.stringify(results);
}

main().then(console.log).catch(console.error);