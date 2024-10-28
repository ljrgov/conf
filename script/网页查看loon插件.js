// kelee_plugin.js
let url = $request.url;

// 检查 URL 是否以 kelee.one 或 nsloon 的 import 相关链接开头
if (url.startsWith("https://kelee.one") && url.endsWith(".plugin")) {
    // 请求 kelee.one 的 .plugin 文件
    $httpClient.get(url, function (error, response, data) {
        if (error) {
            $notify("请求失败", "", error);
            return;
        }
        $done({ body: data });
    });
} else if (url.startsWith("https://www.nsloon.com/openloon/import?plugin=")) {
    // 获取查询参数中的 plugin URL
    let pluginUrl = new URL(url).searchParams.get("plugin");
    if (pluginUrl && pluginUrl.startsWith("https://kelee.one") && pluginUrl.endsWith(".plugin")) {
        // 请求 kelee.one 的 .plugin 文件
        $httpClient.get(pluginUrl, function (error, response, data) {
            if (error) {
                $notify("请求失败", "", error);
                return;
            }
            // 返回内容
            $done({ body: data });
        });
    } else {
        $done({});
    }
} else {
    $done({});
}