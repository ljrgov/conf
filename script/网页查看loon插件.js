// nsloon_plugin_view.js

// 从请求 URL 中提取 `plugin` 参数中的实际插件链接
let pluginUrl = new URL($request.url).searchParams.get("plugin");

if (pluginUrl) {
    $httpClient.get(pluginUrl, function (error, response, data) {
        if (error) {
            $notify("请求失败", "无法访问插件文件", error);
            $done({});
            return;
        }
        // 将 .plugin 文件内容返回为纯文本显示
        $done({
            status: 200,
            headers: { "Content-Type": "text/plain" },
            body: data
        });
    });
} else {
    // 如果未找到 plugin 参数
    $done({});
}