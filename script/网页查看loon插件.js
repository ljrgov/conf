// plugin_view.js

// 获取请求的内容
let responseBody = $response.body;

// 设置 Content-Type 为 text/plain 以便浏览器显示
$done({
    status: 200,
    headers: {
        "Content-Type": "text/plain", // 设置为纯文本
        "Access-Control-Allow-Origin": "*", // 允许跨域请求
    },
    body: responseBody // 返回原始内容
});