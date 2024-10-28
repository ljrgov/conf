// kelee_plugin_view.js
// 将 .plugin 文件内容作为纯文本返回
$done({ 
    headers: { "Content-Type": "text/plain" }, 
    body: $response.body 
});