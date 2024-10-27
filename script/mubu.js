#幕布脚本

var aFengYe = $response.body;
var obj =  JSON.parse(aFengYe);

var vipInfo = {
  "level": 2,
  "vipEndDate": "2999-01-01"
}

for (let key in obj.data) {
  if (vipInfo.hasOwnProperty(key)) {
     obj.data[key] = vipInfo[key]
  }
}

aFengYe = JSON.stringify(obj);
$done(aFengYe);