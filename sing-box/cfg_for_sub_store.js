/**
* Sub Store 远程脚本：参数版 (多端入站精准适配)
*/
async function execute() {
    try {
        // --- 工具函数：安全去除 JSON 注释（支持 // 和 /* */，不会误伤字符串内的 // 或 /* */）---
        function stripJsonComments(str) {
            let result = '';
            let inString = false;
            let inSingleComment = false;
            let inMultiComment = false;
            let escapeNext = false;

            for (let i = 0; i < str.length; i++) {
                const c = str[i];
                const next = str[i + 1];

                if (inSingleComment) {
                    if (c === '\n') { inSingleComment = false; result += c; }
                    continue;
                }
                if (inMultiComment) {
                    if (c === '*' && next === '/') { inMultiComment = false; i++; }
                    continue;
                }
                if (inString) {
                    result += c;
                    if (escapeNext) escapeNext = false;
                    else if (c === '\\') escapeNext = true;
                    else if (c === '"') inString = false;
                    continue;
                }
                if (c === '"') { inString = true; result += c; continue; }
                if (c === '/' && next === '/') { inSingleComment = true; i++; continue; }
                if (c === '/' && next === '*') { inMultiComment = true; i++; continue; }
                result += c;
            }

            let cleaned = result;
            cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
            return cleaned;
        }

        let config = JSON.parse(stripJsonComments($content));

        // --- 0. 基础参数预处理 ---
        const args = $arguments || {};
        const device = (args.device || "").toLowerCase();
        const level = args.level;
        const output = args.output ? args.output.replace(/\\/g, '\\\\') : null;
        const listen = args.listen;
        const port = args.port;
        const external_ui = args.external_ui;
        const secret = args.secret;
        const mirror = args.mirror;

        const toBool = (v) => v === true || String(v).toLowerCase() === "true";
        const bridge = toBool(args.bridge);
        const isAndroidUserEnabled = toBool(args.android_user);
        const isEbpfEnabled = toBool(args.ebpf);
        const nocache = toBool(args.nocache);

        // --- 1. Log (日志) ---
        config.log ??= {};

        config.log.level = level ?? config.log.level;
        config.log.output = output ?? config.log.output;

        // --- 2. Providers (订阅提供者) ---
        if (config.providers && Array.isArray(config.providers)) {
            config.providers.forEach((provider, index) => {
                let targetUrl = args[`url${index + 1}`] || (index === 0 ? args.url : null);
                if (targetUrl && provider.type === "remote") {
                    provider.url = targetUrl;
                }
            });
        }

        // --- 3. Inbounds (入站适配 - 强安全白名单版) ---
        if (config.inbounds && Array.isArray(config.inbounds)) {

            const isClient = ["windows", "win", "client", "tun", "android"].includes(device);
            const isRoot = device === "root";
            const isServer = ["linux", "tproxy", "server"].includes(device);

            config.inbounds = config.inbounds.filter(inbound => {
                if (isEbpfEnabled) {
                    if (inbound.type === "tun" || inbound.type === "tproxy") return false;
                } else {
                    if (inbound.type === "ebpf") return false;
                }

                if (isClient && inbound.type === "tproxy") return false;

                if (device === "tproxy" && inbound.type === "tun") return false;

                return true;
            });

            config.inbounds.forEach(inbound => {
                if (inbound.type === "tun") {
                    inbound.auto_redirect = isRoot || isServer;

                    const fieldsToDelete = new Set();

                    if (isRoot || isServer) {
                        fieldsToDelete.add("route_exclude_address");
                        fieldsToDelete.add("platform");
                    }
                    if (isServer) {
                        fieldsToDelete.add("include_android_user");
                        fieldsToDelete.add("include_package");
                        fieldsToDelete.add("exclude_package");
                    }

                    if (!isAndroidUserEnabled) {
                        fieldsToDelete.add("include_android_user");
                    } else {
                        fieldsToDelete.add("platform");
                    }

                    fieldsToDelete.forEach(field => delete inbound[field]);

                    if (port && inbound.platform?.http_proxy) {
                        inbound.platform.http_proxy.server_port = parseInt(port);
                    }
                }

                if (inbound.type === "mixed") {
                    if (listen) inbound.listen = listen;
                    if (port) inbound.listen_port = parseInt(port);
                }
            });
        }

        // --- 3.1 Bridge 参数动态裁剪逻辑 ---
        if (!bridge) {
            if (config.outbounds && Array.isArray(config.outbounds)) {
                config.outbounds = config.outbounds.filter(outbound => outbound.tag !== "bridge");
            }
            if (config.route && Array.isArray(config.route.rules)) {
                config.route.rules = config.route.rules.filter(rule => rule.outbound !== "bridge");
            }
        }

        // --- 4. Services (服务) ---
        if (config.services && config.services[0]) {
            if (secret) {
                config.services[0].secret = secret;
            }
        }

        // --- 5. Experimental (Clash API) ---
        if (config.experimental?.clash_api) {
            if (external_ui) config.experimental.clash_api.external_ui = external_ui;
            if (secret) config.experimental.clash_api.secret = secret;
        }

        // --- 6. 全局镜像替换 (精准防套娃逻辑) ---
        let configString = JSON.stringify(config, null, 2);
        if (mirror) {
            const prefix = mirror.endsWith('/') ? mirror : mirror + '/';
            const githubRegex = /https?:\/\/(raw\.githubusercontent\.com|github\.com|gist\.githubusercontent\.com)\/[^\s"']+/g;

            configString = configString.replace(githubRegex, (match, domain, offset) => {
                const charBefore = configString.substring(offset - 1, offset);
                const alreadyPrefixed = configString.substring(0, offset).endsWith(prefix);

                if (charBefore === '/' || alreadyPrefixed) {
                    return match;
                }
                return prefix + match;
            });
        }

        // --- 7. 可选：给 Gist 订阅链接加时间戳绕过 CDN 缓存（nocache=true 才生效，只作用于 gist）---
        if (nocache) {
            const gistPattern = /(https?:\/\/gist\.githubusercontent\.com\/[^\s"']+)/g;
            const ts = Date.now();

            configString = configString.replace(gistPattern, (match) => {
                const sep = match.includes('?') ? '&' : '?';
                return `${match}${sep}_t=${ts}`;
            });
        }

        $content = configString;

    } catch (e) {
        console.error("Sub-Store 脚本执行失败: " + e.message);
    }
}

await execute();