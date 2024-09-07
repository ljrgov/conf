//K歌
//去广告
let url = $request.url;
// 移除广告相关的 query 参数
let modifiedUrl = url.replace(/adposcount=\d+&/, '')
                     .replace(/block_effect=\d+&/, '')
                     .replace(/count=\d+&/, '')
                     .replace(/pass_through=.*?&/, '')
                     .replace(/ext=.*?&/, '');
$done({ url: modifiedUrl });
//截止

