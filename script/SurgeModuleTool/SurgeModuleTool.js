// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
  
let ToolVersion = "1.5";

async function delay(milliseconds) {
  var before = Date.now()
  while (Date.now() < before + milliseconds) {}
  return true
}
function convertToValidFileName(str) {
  // 替换非法字符为下划线
  const invalidCharsRegex = /[\/:*?"<>|]/g
  const validFileName = str.replace(invalidCharsRegex, '_')

  // 删除多余的点号
  const multipleDotsRegex = /\.{2,}/g
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.')

  // 删除文件名开头和结尾的点号和空格
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '')

  return finalFileName
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  const lastIndex = matchArray ? matchArray.length - 1 : -1;

  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex]
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex)
    return newText
  }

  return text
}

// 更新模块分类的函数
function updateCategory(content, newCategory) {
  const categoryRegex = /^#!category\s*?=\s*?(.*?)\s*(\n|$)/im;
  if (categoryRegex.test(content)) {
    return content.replace(categoryRegex, `#!category=${newCategory}\n`);
  } else {
    return addLineAfterLastOccurrence(content, `\n#!category=${newCategory}\n`);
  }
}

// 弹出对话框让用户选择分类
async function promptForCategory(currentCategory) {
  let alert = new Alert();
  alert.title = '选择模块分类';
  alert.addAction('功能模块');
  alert.addAction('去广告');
  alert.addAction('面板模块');
  alert.addCancelAction('取消');

  let idx = await alert.presentAlert();
  
  if (idx === -1) {
    return currentCategory; // 用户取消操作，不改变分类
  }
  
  switch (idx) {
    case 0:
      return '功能模块';
    case 1:
      return '去广告';
    case 2:
      return '面板模块';
    default:
      return currentCategory; // 默认情况下返回当前分类
  }
}

// 用户操作选择
async function main() {
  let idx;
  let fromUrlScheme;
  let checkUpdate;

  if (args.queryParameters.url) {
    fromUrlScheme = true;
  }

  if (fromUrlScheme) {
    idx = 1;
  } else {
    const alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.addDestructiveAction('更新本脚本');
    alert.addAction('从链接创建');
    alert.addAction('更新单个模块');
    alert.addAction('更新全部模块');
    alert.addCancelAction('取消');
    idx = await alert.presentAlert();
  }

  const fm = FileManager.iCloud();
  let folderPath;
  let files = [];
  let contents = [];

  if (idx === 3) {
    folderPath = await DocumentPicker.openFolder();
    files = fm.listContents(folderPath);
  } else if (idx === 2) {
    const filePath = await DocumentPicker.openFile();
    folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
  } else if (idx === 1) {
    let url;
    let name;
    if (fromUrlScheme) {
      url = args.queryParameters.url;
      name = args.queryParameters.name;
    } else {
      const alert = new Alert();
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
      if (!name) {
        const plainUrl = url.split('?')[0];
        const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
        name = fullname ? fullname.replace(/\.sgmodule$/, '') : `untitled-${new Date().toLocaleString()}`;
      }
      name = convertToValidFileName(name);
      files = [`${name}.sgmodule`];
      contents = [`#SUBSCRIBED ${url}`];
    }
  } else if (idx === 0) {
    console.log('检查更新');
    checkUpdate = true;
    await update();
  }

  let report = { success: 0, fail: [], noUrl: 0 };

  if (files.length > 0) {
    if (folderPath) {
      await processLocalModules(folderPath); // Ensure this function is defined
    } else {
      for (const file of files) {
        const filePath = `${folderPath}/${file}`;
        const content = contents.length > 0 ? contents[files.indexOf(file)] : fm.readString(filePath);
        await handleLocalModuleUpdate(filePath); // Ensure this function is defined
      }
    }
  }

  for (const [index, file] of files.entries()) {
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
        originalName = originalNameMatched ? originalNameMatched[1] : '';

        const originalDescMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
        originalDesc = originalDescMatched ? originalDescMatched[1].replace(/^🔗.*?]\s*/i, '') : '';

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
        const res = await req.loadString();
        const statusCode = req.response.statusCode;
        if (statusCode < 200 || statusCode >= 400) {
          throw new Error(`statusCode: ${statusCode}`);
        }

        const nameMatched = res.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
        if (!nameMatched) {
          throw new Error('不是合法的模块内容');
        }

        const name = nameMatched[1];
        if (!name) {
          throw new Error('模块无名称字段');
        }

        const descMatched = res.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
        let desc = descMatched ? descMatched[1] : '';
        if (!desc) {
          res = `#!desc=\n${res}`;
        }
        res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
        res = addLineAfterLastOccurrence(res, `\n\n#SUBSCRIBED ${url}`);

        await fm.writeString(filePath, res);
        report.success += 1;
      } catch (e) {
        console.error(e.message);
        if (noUrl) {
          report.noUrl += 1;
        } else {
          report.fail.push(file);
        }
      }
    }
  }

  const reportMessage = `成功: ${report.success}\n失败: ${report.fail.join(', ')}\n无链接: ${report.noUrl}`;
  const alert = new Alert();
  alert.title = '处理完成';
  alert.message = reportMessage;
  alert.addAction('关闭');
  await alert.presentAlert();
}

main().catch(console.error);

      let nameInfo = `${name}`
      let descInfo = `${desc}`
      if (originalName && name !== originalName) {
        nameInfo = `${originalName} -> ${name}`
      }
      if (originalDesc && desc !== originalDesc) {
        descInfo = `${originalDesc} -> ${desc}`
      }
      console.log(`\n✅ ${nameInfo}\n${descInfo}\n${file}`)
      report.success += 1
      await delay(1 * 1000)
      if (fromUrlScheme) {
        alert = new Alert()
        alert.title = `✅ ${nameInfo}`
        alert.message = `${descInfo}\n${file}`
        alert.addDestructiveAction('重载 Surge')
        alert.addAction('打开 Surge')
        alert.addCancelAction('关闭')
        idx = await alert.presentAlert()
        if (idx == 0) {
          const req = new Request('http://script.hub/reload')
          req.timeoutInterval = 10
          req.method = 'GET'
          let res = await req.loadString()
        } else if (idx == 1) {
          Safari.open('surge://')
        }
      }
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1
      } else {
        report.fail.push(originalName || file)
      }

      if (noUrl) {
        console.log(`\n🈚️ ${originalName || ''}\n${file}`)
        console.log(e)
      } else {
        console.log(`\n❌ ${originalName || ''}\n${file}`)
        console.error(`${originalName || file}: ${e}`)
      }
      if (fromUrlScheme) {
        alert = new Alert()
        alert.title = `❌ ${originalName || ''}\n${file}`
        alert.message = `${e.message || e}`
        alert.addCancelAction('关闭')
        await alert.presentAlert()
      }
    }
  }
}
if (!checkUpdate && !fromUrlScheme) {
  alert = new Alert()
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '',
    noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : ''
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
    report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
  }`
  alert.addDestructiveAction('重载 Surge')
  alert.addAction('打开 Surge')
  alert.addCancelAction('关闭')
  idx = await alert.presentAlert()
  if (idx == 0) {
    const req = new Request('http://script.hub/reload')
    req.timeoutInterval = 10
    req.method = 'GET'
    let res = await req.loadString()
  } else if (idx == 1) {
    Safari.open('surge://')
  }
}


// @key Think @wuhu.
async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;

  try {
    const url = `https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=${Date.now()}`;
    const req = new Request(url);
    req.method = 'GET';
    req.headers = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
    resp = await req.loadString();

    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    version = match ? match[1] : '';
  } catch (e) {
    console.error('Error fetching the script version:', e);
    return;
  }

  if (!version) {
    const alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = '无法获取在线版本';
    alert.addCancelAction('关闭');
    await alert.presentAlert();
    return;
  }

  const needUpdate = version > ToolVersion;
  if (!needUpdate) {
    const alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
    alert.addDestructiveAction('强制更新');
    alert.addCancelAction('关闭');
    const idx = await alert.presentAlert();
    if (idx === 0) {
      needUpdate = true;
    }
  }

  if (needUpdate) {
    try {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      console.log('更新成功: ' + version);
      const notification = new Notification();
      notification.title = `Surge 模块工具 更新成功: ${version}`;
      notification.subtitle = '点击通知跳转';
      notification.sound = 'default';
      notification.openURL = `scriptable:///open/${scriptName}`;
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
      await notification.schedule();
    } catch (e) {
      console.error('Error updating the script:', e);
    }
  }
}

