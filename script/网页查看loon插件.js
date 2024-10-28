const $ = new Compatibility();

!(async () => {
    try {
        const response = await $.http.get($request.url);
        if (!response.body) {
            throw new Error('获取内容失败');
        }

        // 处理插件内容，格式化显示
        const pluginContent = response.body;
        const filename = decodeURIComponent($request.url.split('/').pop());
        
        // 创建HTML页面，增加代码高亮和复制功能
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 0;
            padding: 15px;
            background: #f5f5f5;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            padding: 15px 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #eee;
        }
        .filename {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin: 0;
        }
        .content {
            padding: 20px;
            position: relative;
        }
        pre {
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: Monaco, Consolas, Courier, monospace;
            font-size: 14px;
            line-height: 1.5;
            color: #333;
        }
        .copy-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            padding: 8px 12px;
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            color: #666;
            cursor: pointer;
            transition: all 0.2s;
        }
        .copy-btn:active {
            background: #e9ecef;
        }
        .section {
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }
        .section:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        .section-title {
            font-weight: 600;
            margin-bottom: 8px;
            color: #444;
        }
        @media (max-width: 480px) {
            body { padding: 10px; }
            .header { padding: 12px 15px; }
            .content { padding: 15px; }
            pre { font-size: 13px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="filename">${filename}</h1>
        </div>
        <div class="content">
            <button class="copy-btn" onclick="copyContent()">复制内容</button>
            <pre id="plugin-content">${escapeHtml(pluginContent)}</pre>
        </div>
    </div>
    <script>
        function copyContent() {
            const content = document.getElementById('plugin-content').textContent;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.querySelector('.copy-btn');
                btn.textContent = '已复制';
                setTimeout(() => {
                    btn.textContent = '复制内容';
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请手动复制');
            });
        }
    </script>
</body>
</html>`;

        $done({
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                },
                body: html
            }
        });
        
    } catch (err) {
        // 错误处理
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .error-container {
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .error-message {
            color: #dc3545;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h2 class="error-message">加载失败</h2>
        <p>${err.message || '请检查网络连接后重试'}</p>
    </div>
</body>
</html>`;

        $done({
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                },
                body: errorHtml
            }
        });
    }
})();

// 工具函数：HTML转义
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Surge兼容性函数
function Compatibility() {
    this.http = {
        get: async (url) => {
            return new Promise((resolve, reject) => {
                $httpClient.get({
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
                    }
                }, (error, response, body) => {
                    if (error) reject(error);
                    else resolve({ response, body });
                });
            });
        }
    };
}