/***********************************

> 应用名称：Swiftgram
> 链接：https://raw.githubusercontent.com/ddgksf2013/MoYu/master/NicegramProCrack.js
> 问题反馈：ddgksf2013@163.com
> 特别提醒：如需转载请注明出处，谢谢合作！
> 解锁步骤：https://t.me/ddgksf2021/5439
> 特别说明：⚠️⚠️⚠️
          本脚本仅供学习交流使用，禁止转载售卖
          ⚠️⚠️⚠️
[rewrite_local]
  
# > Nicegram☆解锁会员权限（2024-02-24）@ddgksf2013
^https?:\/\/nicegram\.cloud\/api\/v\d\/(ai-assistant\/purchase-list|user\/info|telegram\/auth) url script-response-body https://github.com/ddgksf2013/MoYu/raw/master/NicegramProCrack.js

[mitm] 

hostname=nicegram.cloud

***********************************/


var body=$response.body.replace(/subscription":\w+/g,'subscription":true');
$done({body});