/**
* Sub Store 远程脚本：参数版 (多端入站精准适配)
*/
async function execute() {
    try {
        let config = JSON.parse($content);

        // --- 0. 基础参数预处理 ---
        const args = $arguments || {};
        const device = (args.device || "").toLowerCase();
        const mirror = args.mirror;
        const download_detour = args.download_detour;
        const external_ui = args.external_ui;
        const secret = args.secret;
        const listen = args.listen;
        const port = args.port;
        const output = args.output ? args.output.replace(/\\/g, '\\\\') : null;

        // --- 1. Log (日志) ---
        if (output && config.log) {
            config.log.output = output;
        }

        // --- 2. Providers (订阅提供者) ---
        if (config.providers && Array.isArray(config.providers)) {
            config.providers.forEach((provider, index) => {
                let targetUrl = args[`url${index + 1}`] || (index === 0 ? args.url : null);
                if (targetUrl && provider.type === "remote") {
                    provider.url = targetUrl;
                }
                if (download_detour && provider.type === "remote") {
                    provider.download_detour = download_detour;
                }
            });
        }

        // --- 3. Inbounds (入站适配 - 核心逻辑调整) ---
        if (config.inbounds && Array.isArray(config.inbounds)) {
            
            // 定义参数组
            const isClient = ["windows", "win", "client", "tun", "android"].includes(device);
            const isRoot = device === "root";
            const isServer = ["linux", "tproxy", "server"].includes(device);

            // 过滤与字段调整
            config.inbounds = config.inbounds.filter(inbound => {
                // Client 模式不需要 tproxy
                if (isClient && inbound.type === "tproxy") return false;
                return true;
            }).map(inbound => {
                // 处理 TUN 类型的细分字段
                if (inbound.type === "tun") {
                    if (isClient) {
                        // 保留 platform, include_android_user 等，关闭 auto_redirect
                        inbound.auto_redirect = false;
                    } else if (isRoot) {
                        // root 模式：开启重定向，移除 platform
                        inbound.auto_redirect = true;
                        delete inbound.platform;
                    } else if (isServer) {
                        // server 模式：开启重定向，移除 platform, android 相关字段
                        inbound.auto_redirect = true;
                        delete inbound.platform;
                        delete inbound.include_android_user;
                        delete inbound.include_package;
                        delete inbound.exclude_package;
                    }

                    // 统一处理自定义端口
                    if (port && inbound.platform?.http_proxy) {
                        inbound.platform.http_proxy.server_port = parseInt(port);
                    }
                }

                // 处理 Mixed 类型的监听地址与端口
                if (inbound.type === "mixed") {
                    if (listen) inbound.listen = listen;
                    if (port) inbound.listen_port = parseInt(port);
                }

                return inbound;
            });
        }

        // --- 4. Route (路由及规则集) ---
        if (config.route && Array.isArray(config.route.rule_set)) {
            config.route.rule_set.forEach(item => {
                if (download_detour && item.type === "remote") {
                    item.download_detour = download_detour;
                }
            });
        }

        // --- 5. Experimental (Clash API) ---
        if (config.experimental?.clash_api) {
            if (external_ui) config.experimental.clash_api.external_ui = external_ui;
            if (secret) config.experimental.clash_api.secret = secret;
            if (download_detour) config.experimental.clash_api.external_ui_download_detour = download_detour;
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

        $content = configString;

    } catch (e) {
        console.error("Sub-Store 脚本执行失败: " + e.message);
    }
}

await execute();

