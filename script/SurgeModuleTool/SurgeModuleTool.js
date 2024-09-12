// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.04";

async function delay(milliseconds) {
  var before = Date.now()
  while (Date.now() < before + milliseconds) {}
  return true
}

function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g
  const validFileName = str.replace(invalidCharsRegex, '_')
  const multipleDotsRegex = /\.{2,}/g
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.')
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '')
  return finalFileName
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm
  const matchArray = text.match(regex)
  const lastIndex = matchArray ? matchArray.length - 1 : -1
  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex]
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex)
    return newText
  }
  return text
}

async function updateModules(files, folderPath, contents = []) {
  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
  };

  for await (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      try {
        // 读取文件内容
        let content = contents[index] || await readFileContent(file, folderPath);

        // 解析原始信息和订阅链接
        let originalCategory = extractInfo(content, 'category');
        const subscribeMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
        if (!subscribeMatch) {
          throw new Error('无订阅链接');
        }
        const url = subscribeMatch[1];

        // 下载和验证新内容
        let newContent = await downloadContent(url);

        // 解析新内容
        let newName = extractInfo(newContent, 'name');
        let newDesc = extractInfo(newContent, 'desc');

        // 确定最终使用的分类
        let finalCategory = originalCategory || "📚未分类";

        // 构建更新后的内容
        newContent = `#!name=${newName}\n#!category=${finalCategory}\n#!desc=🔗 [${new Date().toLocaleString()}] ${newDesc}\n\n# 🔗 模块链接\n#SUBSCRIBED ${url}\n\n${newContent.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '')}`;

        // 保存更新后的内容
        await saveFileContent(file, folderPath, newContent);

        // 重新分类
        let updatedCategory = await chooseCategory(finalCategory);
        if (updatedCategory !== "📚保持当前分类") {
          newContent = newContent.replace(/#!category=.*\n/, `#!category=${updatedCategory}\n`);
          await saveFileContent(file, folderPath, newContent);
        }

        console.log(`✅ 更新成功: ${file}`);
        report.success += 1;

      } catch (error) {
        if (error.message === '无订阅链接') {
          report.noUrl += 1;
        } else {
          report.fail.push(file);
        }
        console.error(`❌ 更新失败: ${file} - ${error.message}`);
      }
    }
  }

  return report;
}

async function downloadContent(url) {
  const req = new Request(url);
  req.timeoutInterval = 10;
  req.method = 'GET';
  let content = await req.loadString();
  if (req.response.statusCode < 200 || req.response.statusCode >= 400) {
    throw new Error(`HTTP 状态码: ${req.response.statusCode}`);
  }
  if (!content) {
    throw new Error('未获取到模块内容');
  }
  return content;
}

function extractInfo(content, type) {
  const match = content.match(new RegExp(`^#!${type}\\s*=\\s*(.*?)\\s*(\n|$)`, 'im'));
  return match ? match[1] : '';
}

async function readFileContent(file, folderPath) {
  const fm = FileManager.iCloud();
  const filePath = `${folderPath}/${file}`;
  return fm.readString(filePath);
}

async function saveFileContent(file, folderPath, content) {
  if (folderPath) {
    const fm = FileManager.iCloud();
    const filePath = `${folderPath}/${file}`;
    fm.writeString(filePath, content);
  } else {
    // 如果没有 folderPath，说明是新创建的文件，使用导出功能
    await DocumentPicker.exportString(content, file);
  }
}

async function chooseCategory(currentCategory) {
  let alert = new Alert();
  alert.title = "选择模块分类";
  alert.message = `当前分类: ${currentCategory}`;
  alert.addAction("📙广告模块");
  alert.addAction("📘功能模块");
  alert.addAction("📗面板模块");
  alert.addAction("📚保持当前分类");
  let choice = await alert.presentAlert();
  const categories = ["📙广告模块", "📘功能模块", "📗面板模块", "📚保持当前分类"];
  return categories[choice];
}

async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = 'https://raw.githubusercontent.com/Script-Hub-Org/Script-Hub/main/SurgeModuleTool.js?v=' + Date.now();
    let req = new Request(url);
    req.method = 'GET';
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    resp = await req.loadString();

    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    version = match ? match[1] : '';
  } catch (e) {
    console.error(e);
  }

  if (!version) {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = '无法获取在线版本';
    alert.addCancelAction('关闭');
    await alert.presentAlert();
    return;
  } else {
    let needUpdate = version > ToolVersion;
    if (!needUpdate) {
      let alert = new Alert();
      alert.title = 'Surge 模块工具';
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
      alert.addDestructiveAction('强制更新');
      alert.addCancelAction('关闭');
      idx = await alert.presentAlert();
      if (idx === 0) {
        needUpdate = true;
      }
    }
    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      console.log('更新成功: ' + version);
      let notification = new Notification();
      notification.title = 'Surge 模块工具 更新成功: ' + version;
      notification.subtitle = '点击通知跳转';
      notification.sound = 'default';
      notification.openURL = `scriptable:///open/${scriptName}`;
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
      await notification.schedule();
    }
  }
}

// 主脚本逻辑
let idx;
let fromUrlScheme;
let checkUpdate;
let cancelled = false;

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
    cancelled = true;
  }
}

if (!cancelled) {
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
      let alert = new Alert();
      alert.title = '将自动添加后缀 .sgmodule';
      alert.addTextField('链接(必填)', '');
      alert.addTextField('名称(选填)', '');
      alert.addAction('下载');
      alert.addCancelAction('取消');
      let response = await alert.presentAlert();
      
      if (response === -1) {
        cancelled = true;
      } else {
        url = alert.textFieldValue(0);
        name = alert.textFieldValue(1);
      }
    }
    
    if (!cancelled && url) {
      let validUrl = false;
      try {
        new URL(url);
        validUrl = true;
      } catch (error) {
        let errorAlert = new Alert();
        errorAlert.title = "⚠️ 错误";
        errorAlert.message = "输入的URL无效";
        errorAlert.addAction("确定");
        await errorAlert.present();
      }

      if (validUrl) {
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
    }
  } else if (idx == 0) {
    console.log('检查更新');
    checkUpdate = true;
    await update();
  }

  if (!cancelled && !checkUpdate) {
    let report = await updateModules(files, folderPath, contents);

    if (!fromUrlScheme) {
      let alert = new Alert();
      alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
      alert.message = `✅ 更新成功: ${report.success}\n❌ 更新失败: ${report.fail.length}\n🈚️ 无链接: ${report.noUrl}`;
      if (report.fail.length > 0) {
        alert.message += `\n\n失败的模块:\n${report.fail.join('\n')}`;
      }
      alert.addDestructiveAction('重载 Surge');
      alert.addAction('打开 Surge');
      alert.addCancelAction('关闭');
      let choice = await alert.presentAlert();
      if (choice == 0) {
        const req = new Request('http://script.hub/reload');
        req.timeoutInterval = 10;
        req.method = 'GET';
        let res = await req.loadString();
      } else if (choice == 1) {
        Safari.open('surge://');
      }
    }
  }
}
