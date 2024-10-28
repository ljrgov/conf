const $ = new Compatibility();

!(async () => {
    try {
        const response = await $.http.get($request.url);
        if (!response.body) {
            throw new Error('获取内容失败');
        }

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plugin Content</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #fff;
        }
        pre {
            margin: 0;
            white-space: pre;
            font-family: Monaco, Consolas, monospace;
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <pre>${response.body}</pre>
</body>
</html>`;

        $done({
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                },
                body: html
            }
        });
        
    } catch (err) {
        $done({
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                },
                body: `<pre>Error: ${err.message}</pre>`
            }
        });
    }
})();

function Compatibility() {
    this.http = {
        get: async (url) => {
            return new Promise((resolve, reject) => {
                $httpClient.get({
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
                    }
                }, (error, response, body) => {
                    if (error) reject(error);
                    else resolve({ response, body });
                });
            });
        }
    };
}