// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

let ToolVersion = "2.03";

async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function convertToValidFileName(str) {
  return str.replace(/[\/:*?"<>|]/g, '_')
            .replace(/\.{2,}/g, '.')
            .trim();
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  let matchArray = Array.from(text.matchAll(regex));
  if (matchArray.length > 0) {
    const lastMatch = matchArray[matchArray.length - 1][0];
    return text.replace(lastMatch, lastMatch + addition);
  }
  return text;
}

let idx;
let fromUrlScheme = Boolean(args.queryParameters.url);

if (fromUrlScheme) {
  idx = 1;
} else {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addDestructiveAction('更新本脚本');
  alert.addAction('从链接创建');
  alert.addAction('更新单个模块');
  alert.addAction('更新全部模块');
  alert.addCancelAction('取消');
  idx = await alert.presentAlert();
}

let folderPath, files = [], contents = [];
const fm = FileManager.iCloud();

if (idx === 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx === 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx === 1) {
  let url = fromUrlScheme ? args.queryParameters.url : '';
  let name = fromUrlScheme ? args.queryParameters.name : '';
  
  if (!url) {
    let alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    alert.addAction('下载');
    alert.addCancelAction('取消');
    await alert.presentAlert();
    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);
  }

  if (url) {
    name = name || url.split('?')[0].split('/').pop().replace(/\.sgmodule$/, '');
    name = convertToValidFileName(name) || `untitled-${new Date().toLocaleString()}`;
    files = [`${name}.sgmodule`];
    contents = [`#SUBSCRIBED ${url}`];
  }
} else if (idx === 0) {
  console.log('检查更新');
  await update();
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

for await (const [index, file] of files.entries()) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let originalName, originalDesc, noUrl;
    try {
      let content = contents.length > 0 ? contents[index] : fm.readString(`${folderPath}/${file}`);
      const originalNameMatched = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
      originalName = originalNameMatched ? originalNameMatched[1] : '';
      const originalDescMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      originalDesc = originalDescMatched ? originalDescMatched[1]?.replace(/^🔗.*?]\s*/i, '') : '';
      const matched = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
      
      if (!matched) throw new Error('无订阅链接');
      const subscribed = matched[0];
      const url = matched[1];
      if (!url) throw new Error('无订阅链接');
      
      const req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
      if (req.response.statusCode >= 400) throw new Error(`statusCode: ${req.response.statusCode}`);
      if (!res) throw new Error('未获取到模块内容');
      
      const nameMatched = res.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (!nameMatched) throw new Error('不是合法的模块内容');
      const newName = nameMatched[1];
      if (!newName) throw new Error('模块无名称字段');
      const descMatched = res.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      let desc = descMatched ? descMatched[1] : '';
      if (!desc) res = `#!desc=\n${res}`;
      
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '')
               .replace(/^#!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
      content = res;
      
      if (contents.length > 0) {
        await DocumentPicker.exportString(content, file);
      } else {
        fm.writeString(`${folderPath}/${file}`, content);
      }

      let nameInfo = originalName && newName !== originalName ? `${originalName} -> ${newName}` : newName;
      let descInfo = originalDesc && desc !== originalDesc ? `${originalDesc} -> ${desc}` : desc;
      console.log(`\n✅ ${nameInfo}\n${descInfo}\n${file}`);
      report.success += 1;
      await delay(1000);

      if (fromUrlScheme) {
        let alert = new Alert();
        alert.title = `✅ ${nameInfo}`;
        alert.message = `${descInfo}\n${file}`;
        alert.addDestructiveAction('重载 Surge');
        alert.addAction('打开 Surge');
        alert.addCancelAction('关闭');
        idx = await alert.presentAlert();
        if (idx === 0) {
          await new Request('http://script.hub/reload').loadString();
        } else if (idx === 1) {
          Safari.open('surge://');
        }
      }
    } catch (e) {
      report.noUrl += noUrl ? 1 : 0;
      report.fail.push(originalName || file);
      console.log(`\n${noUrl ? '🈚️' : '❌'} ${originalName || ''}\n${file}`);
      console.error(`${originalName || file}: ${e.message || e}`);
      
      if (fromUrlScheme) {
        let alert = new Alert();
        alert.title = `❌ ${originalName || ''}\n${file}`;
        alert.message = `${e.message || e}`;
        alert.addCancelAction('关闭');
        await alert.presentAlert();
      }
    }
  }
}

if (!checkUpdate && !fromUrlScheme) {
  let alert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  idx = await alert.presentAlert();
  if (idx === 0) {
    await new Request('http://script.hub/reload').loadString();
  } else if (idx === 1) {
    Safari.open('surge://');
  }
}

// @key Think @wuhu.
async function update() {
  const fm = FileManager.iCloud()
  const dict = fm.documentsDirectory()
  // const scriptName = Script.name()
  const scriptName = 'SurgeModuleTool'
  let version
  let resp
  try {
    const url = 'https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=' + Date.now()
    let req = new Request(url)
    req.method = 'GET'
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    }
    resp = await req.loadString()

    const regex = /let ToolVersion = "([\d.]+)"/
    const match = resp.match(regex)
    version = match ? match[1] : ''
  } catch (e) {
    console.error(e)
  }

  if (!version) {
    let alert = new Alert()
    alert.title = 'Surge 模块工具'
    alert.message = '无法获取在线版本'
    alert.addCancelAction('关闭')
    await alert.presentAlert()
    return
  } else {
    let needUpdate = version > ToolVersion
    if (!needUpdate) {
      let alert = new Alert()
      alert.title = 'Surge 模块工具'
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`
      alert.addDestructiveAction('强制更新')
      alert.addCancelAction('关闭')
      idx = await alert.presentAlert()
      if (idx === 0) {
        needUpdate = true
      }
    }
    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp)
      console.log('更新成功: ' + version)
      let notification = new Notification()
      notification.title = 'Surge 模块工具 更新成功: ' + version
      notification.subtitle = '点击通知跳转'
      notification.sound = 'default'
      notification.openURL = `scriptable:///open/${scriptName}`
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false)
      await notification.schedule()
    }
  }
}


