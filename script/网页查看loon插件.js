//
const $ = new Compatibility();

!(async () => {
    const response = await $.http.get($request.url);
    
    // 创建HTML页面
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plugin Content</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 15px;
            line-height: 1.5;
            background: #f5f5f5;
        }
        pre {
            background: white;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .filename {
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="filename">${$request.url.split('/').pop()}</div>
    <pre>${response.body}</pre>
</body>
</html>`;

    // 返回HTML响应
    $done({
        response: {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8'
            },
            body: html
        }
    });
})();

// Surge兼容性函数
function Compatibility() {
    this.http = {
        get: async (url) => {
            return new Promise((resolve, reject) => {
                $httpClient.get(url, (error, response, body) => {
                    if (error) reject(error);
                    else resolve({ response, body });
                });
            });
        }
    };
}