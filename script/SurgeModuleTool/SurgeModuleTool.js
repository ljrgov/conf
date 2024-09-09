// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.7";

// 工具函数：延迟函数
async function delay(milliseconds) {
  var before = Date.now();
  while (Date.now() < before + milliseconds) {}
  return true;
}

function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');
  
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');
  
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g;
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '');
  
  return finalFileName;
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  const lastIndex = matchArray ? matchArray.length - 1 : -1;
  
  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex];
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length;
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex);
    return newText;
  }
  
  return text;
}

async function handleCategory(content) {
  const categoryRegex = /^#\!category\s*?=\s*(.*?)\s*(\n|$)/im;
  const categoryMatch = content.match(categoryRegex);
  let categoryValue = "📚未分类";
  
  if (categoryMatch) {
    content = content.replace(categoryRegex, `#!category=${categoryValue}\n`);
  } else {
    const lines = content.split("\n");
    lines.splice(2, 0, `#!category=${categoryValue}`);
    content = lines.join("\n");
  }
  
  const alert = new Alert();
  alert.title = "选择分类";
  alert.addAction("📕 广告模块");
  alert.addAction("📗 功能模块");
  alert.addAction("📘 面板模块");
  alert.addAction("📚 默认分类");
  alert.addCancelAction("取消");
  
  const idx = await alert.presentAlert();
  
  if (idx === -1) {
    return null; // 用户取消选择
  }
  if (idx === 0) {
    categoryValue = "📕 广告模块";
  } else if (idx === 1) {
    categoryValue = "📗 功能模块";
  } else if (idx === 2) {
    categoryValue = "📘 面板模块";
  }
  content = content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${categoryValue}\n`);
  
  return content;
}

async function updateAllModules(files, folderPath, categoryValue) {
  const fm = FileManager.iCloud();
  const report = {
    success: 0,
    fail: [],
    noUrl: 0,
  };

  const progressAlert = new Alert();
  progressAlert.title = '处理进度';
  progressAlert.message = '正在处理模块...';
  progressAlert.addCancelAction('取消');
  const progressAlertId = await progressAlert.presentAlert();

  const promises = files.map(async (file) => {
    try {
      const filePath = `${folderPath}/${file}`;
      let content = fm.readString(filePath);

      content = await handleCategory(content);

      if (content === null) {
        return; // 用户取消操作
      }

      fm.writeString(filePath, content);
      report.success++;
      
    } catch (e) {
      report.fail.push(`${file} - ${e.message}`);
    }
  });

  await Promise.all(promises);

  progressAlert.dismiss();

  const resultAlert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  resultAlert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  resultAlert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  resultAlert.addDestructiveAction('重载 Surge');
  resultAlert.addAction('打开 Surge');
  resultAlert.addCancelAction('关闭');
  
  const idx = await resultAlert.presentAlert();
  
  if (idx === 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx === 1) {
    Safari.open('surge://');
  }
}

async function main() {
  let idx;
  let fromUrlScheme = false;
  let checkUpdate = false;

  if (args.queryParameters.url) {
    fromUrlScheme = true;
  }

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
    
    if (idx === -1) {
      return; // 用户取消操作
    }
  }

  let folderPath;
  let files = [];
  let contents = [];
  const fm = FileManager.iCloud();

  if (idx == 3) {
    folderPath = await DocumentPicker.openFolder();
    files = fm.listContents(folderPath);
  } else if (idx == 2) {
    const filePath = await DocumentPicker.openFile();
    folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
  } else if (idx == 1) {
    let url;
    let name;
    if (fromUrlScheme) {
      url = args.queryParameters.url;
      name = args.queryParameters.name;
    } else {
      alert = new Alert();
      alert.title = '将自动添加后缀 .sgmodule';
      alert.addTextField('链接(必填)', '');
      alert.addTextField('名称(选填)', '');
      alert.addAction('下载');
      alert.addCancelAction('取消');
      
      idx = await alert.presentAlert();

      if (idx === -1) {
        return; // 用户取消操作
      }
      
      url = alert.textFieldValue(0);
      name = alert.textFieldValue(1);
    }
    if (url) {
      if (!name) {
        const plainUrl = url.split('?')[0];
        const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
        if (fullname) {
          name = fullname.replace(/\.sgmodule$/, '');
        }
        if (!name) {
          name = `untitled-${new Date().toLocaleString()}`;
        }
      }
      name = convertToValidFileName(name);
      files = [`${name}.sgmodule`];
      contents = [`#SUBSCRIBED ${url}`];
    }
  } else if (idx == 0) {
    console.log('检查更新');
    checkUpdate = true;
    await update();
    return; // 更新完成后结束脚本
  }

  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
  };

  for await (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      let originalName;
      let originalDesc;
      let noUrl;
      try {
        let content;
        let filePath;
        if (contents.length > 0) {
          content = contents[index];
        } else {
          filePath = `${folderPath}/${file}`;
          content = fm.readString(filePath);
        }
        const originalNameMatched = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
        if (originalNameMatched) {
          originalName = originalNameMatched[1];
        }
        const originalDescMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
        if (originalDescMatched) {
          originalDesc = originalDescMatched[1].replace(/^🔗.*?]\s*/i, '');
        }
        const matched = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
        if (!matched) {
          noUrl = true;
          throw new Error('无订阅链接');
        }
        const subscribed = matched[0];
        const url = matched[1];
        if (!url) {
          noUrl = true;
          throw new Error('无订阅链接');
        }

        const req = new Request(url);
        req.timeoutInterval = 10;
        req.method = 'GET';
        let res = await req.loadString();
        const statusCode = req.response.statusCode;
        if (statusCode !== 200) {
          throw new Error(`请求失败: ${statusCode}`);
        }

        if (originalName) {
          res = addLineAfterLastOccurrence(res, `#!name=${originalName}\n`);
        }
        if (originalDesc) {
          res = addLineAfterLastOccurrence(res, `#!desc=${originalDesc}\n`);
        }
        res = await handleCategory(res);
        if (res === null) {
          return; // 用户取消操作
        }
        
        if (noUrl) {
          content = addLineAfterLastOccurrence(res, `#!url=${url}\n`);
        } else {
          content = res;
        }
        
        if (!contents.length) {
          fm.writeString(filePath, content);
        }
        report.success++;
      } catch (e) {
        report.fail.push(`${file} - ${e.message}`);
      }
    } else {
      report.noUrl++;
    }
  }
  
  if (idx == 3) {
    await updateAllModules(files, folderPath, '📚未分类');
  } else if (idx == 2) {
    let content = contents[0];
    content = await handleCategory(content);
    if (content === null) {
      return; // 用户取消操作
    }
    if (content) {
      fm.writeString(`${folderPath}/${files[0]}`, content);
    }
  } else if (checkUpdate) {
    await update();
  }
}
await main();




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



