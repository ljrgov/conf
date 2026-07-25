/**
* Sub Store 远程脚本：参数版 (多端入站精准适配)
*/
async function execute() {
    try {
        let config = JSON.parse($content);

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
        // --- 新增：处理 bridge 参数 (默认不传或不为 true 则视为 false) ---
        const bridge = args.bridge === true || args.bridge === "true";
        const isAndroidUserEnabled = args.android_user === true || String(args.android_user).toLowerCase() === "true";

        
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

            // 过滤掉不符合模式的入站
            config.inbounds = config.inbounds.filter(inbound => {
                if (isClient && inbound.type === "tproxy") return false;
                return true;
            });

            // 精准裁剪与调整字段
            config.inbounds.forEach(inbound => {
                if (inbound.type === "tun") {
                    // 根据设备模式动态决定 auto_redirect
                    inbound.auto_redirect = !isClient; 

                    // 收集当前需要删除的字段清单
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

                    // 当 android_user 严格等于布尔值 true 或字符串 "true" 时才叫【开启】
                    const isAndroidUserEnabled = args.android_user === true || String(args.android_user).toLowerCase() === "true";
                    
                    if (!isAndroidUserEnabled) {
                        fieldsToDelete.add("include_android_user");
                    } else {
    // 传入参数值true时，直接把和它冲突的 platform 删掉
    fieldsToDelete.add("platform");
                    }

                    // 统一执行删除
                    fieldsToDelete.forEach(field => delete inbound[field]);

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
            });
        }

        // --- 3.1 Bridge 参数动态裁剪逻辑 ---
        if (!bridge) {
            // 移除 outbounds 中 tag 为 bridge 的项
            if (config.outbounds && Array.isArray(config.outbounds)) {
                config.outbounds = config.outbounds.filter(outbound => outbound.tag !== "bridge");
            }
            // 移除 route.rules 中 outbound 为 bridge 的规则
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

        $content = configString;

    } catch (e) {
        console.error("Sub-Store 脚本执行失败: " + e.message);
    }
}

await execute();

