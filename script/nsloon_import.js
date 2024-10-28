// nsloon_import_plugin.js

// 从请求中提取 plugin 参数
let url = new URL($request.url);
let pluginUrl = url.searchParams.get("plugin");

if (pluginUrl) {
    // 重定向到 .plugin 文件
    $done({
        status: 302,
        headers: {
            "Location": pluginUrl // 重定向到实际的 .plugin 文件
        }
    });
} else {
    // 如果未找到 plugin 参数
    $done({});
}