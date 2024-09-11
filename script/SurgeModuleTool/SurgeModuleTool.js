// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.10";

async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function convertToValidFileName(str) {
  return str
    .replace(/[\/:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[\s.]+|[\s.]+$/g, '');
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matches = text.match(regex);
  if (matches) {
    const lastMatch = matches[matches.length - 1];
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }
  return text;
}

async function handleCategory(filePath, name) {
  const fm = FileManager.iCloud();
  let content = fm.readString(filePath);
  
  let categoryMatch = content.match(/^#!category\s*=\s*(.*?)$/m);
  let category = categoryMatch ? categoryMatch[1] : "📚未分类";

  let alert = new Alert();
  alert.title = "模块分类";
  alert.message = `当前模块名称: ${name}\n当前分类: ${category}`;
  alert.addAction("📙广告模块");
  alert.addAction("📗功能模块");
  alert.addAction("📘面板模块");
  alert.addAction("📚保持当前分类");
  
  let choice = await alert.presentAlert();
  
  let newCategory;
  switch (choice) {
    case 0: newCategory = "📙广告模块"; break;
    case 1: newCategory = "📗功能模块"; break;
    case 2: newCategory = "📘面板模块"; break;
    default: return; // 保持当前分类，不做任何改变
  }

  if (newCategory !== category) {
    content = content.replace(/^#!category=.*?$/m, `#!category=${newCategory}`);
    fm.writeString(filePath, content);
    console.log(`已更新模块分类: ${name} -> ${newCategory}`);
  }
}

async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = 'https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=' + Date.now();
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
    return;
  }

  if (!version) {
    console.log('无法获取在线版本');
    return;
  }

  let needUpdate = version > ToolVersion;
  if (!needUpdate) {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
    alert.addDestructiveAction('强制更新');
    alert.addCancelAction('关闭');
    let idx = await alert.presentAlert();
    if (idx === 0) {
      needUpdate = true;
    } else {
      return;
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

async function main() {
  let idx;
  let fromUrlScheme = args.queryParameters.url ? true : false;

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
      return;
    }
  }

  let folderPath;
  let files = [];
  let contents = [];
  const fm = FileManager.iCloud();

  if (idx == 3) {
    try {
      folderPath = await DocumentPicker.openFolder();
      files = fm.listContents(folderPath);
    } catch (e) {
      console.log('用户取消了文件夹选择');
      return;
    }
  } else if (idx == 2) {
    try {
      const filePath = await DocumentPicker.openFile();
      folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
      files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
    } catch (e) {
      console.log('用户取消了文件选择');
      return;
    }
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
      let alertIdx = await alert.presentAlert();
      if (alertIdx === -1) {
        return;
      }
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
      
      const req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let content = await req.loadString();
      content = `#SUBSCRIBED ${url}\n${content}`;
      
      // 设置初始分类为 '📚未分类'
      content = content.replace(/^#!category=.*?$/m, ''); // 移除现有的分类（如果有）
      content = content.replace(/^(#!name=.*?)(\n|$)/, `$1\n#!category=📚未分类$2`);
      
      const fileName = `${name}.sgmodule`;
      const filePath = fm.joinPath(fm.documentsDirectory(), fileName);
      fm.writeString(filePath, content);
      
      console.log(`已保存模块: ${fileName}`);
      
      // 文件保存后进行分类
      await delay(100); // 短暂延迟确保文件已保存
      await handleCategory(filePath, name);
      
      console.log(`已完成模块分类: ${fileName}`);
      
      files = [fileName];
      contents = [fm.readString(filePath)];
    }
  } else if (idx == 0) {
    console.log('检查更新');
    await update();
    return;
  }

  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
  };

  for (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      let originalName;
      let originalDesc;
      let noUrl = false;
      try {
        let content;
        let filePath;
        if (contents.length > 0) {
          content = contents[index];
        } else {
          filePath = `${folderPath}/${file}`;
          content = fm.readString(filePath);
        }
        originalName = content.match(/^#!name\s*=\s*(.*?)\s*(\n|$)/im)?.[1];
        originalDesc = content.match(/^#!desc\s*=\s*(.*?)\s*(\n|$)/im)?.[1]?.replace(/^🔗.*?]\s*/i, '');
        
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
        if (statusCode < 200 || statusCode >= 400) {
          throw new Error(`statusCode: ${statusCode}`);
        }
        if (!res) {
          throw new Error(`未获取到模块内容`);
        }

        const name = res.match(/^#!name\s*=\s*?\s*(.*?)\s*(\n|$)/im)?.[1];
        if (!name) {
          throw new Error('模块无名称字段');
        }
        let desc = res.match(/^#!desc\s*=\s*?\s*(.*?)\s*(\n|$)/im)?.[1];
        if (!desc) {
          res = `#!desc=\n${res}`;
        }
        res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
        res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
        content = `${res}`.replace(/^#!desc\s*=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);
        
        // 保持原有的 category
        const originalCategory = content.match(/^#!category\s*=\s*(.*?)$/m)?.[1] || "📚未分类";
        content = content.replace(/^#!category=.*?$/m, `#!category=${originalCategory}`);
        
        if (filePath) {
          fm.writeString(filePath, content);
          await handleCategory(filePath, name);
        } else {
          await DocumentPicker.exportString(content, file);
        }

        let nameInfo = originalName && name !== originalName ? `${originalName} -> ${name}` : name;
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
          let choice = await alert.presentAlert();
          if (choice == 0) {
            await new Request('http://script.hub/reload').loadString();
          } else if (choice == 1) {
            Safari.open('surge://');
          }
        }
      } catch (e) {
        if (noUrl) {
          report.noUrl += 1;
        } else {
          report.fail.push(originalName || file);
        }

        console.log(`\n${noUrl ? '🈚️' : '❌'} ${originalName || ''}\n${file}`);
        console.error(`${originalName || file}: ${e}`);
        
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

  if (!fromUrlScheme && idx !== 0) {
    let alert = new Alert();
    let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
    let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
    alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
    alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
      report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
    }`;
    alert.addDestructiveAction('重载 Surge');
    alert.addAction('打开 Surge');
    alert.addCancelAction('关闭');
    let choice = await alert.presentAlert();
    if (choice == 0) {
      await new Request('http://script.hub/reload').loadString();
    } else if (choice == 1) {
      Safari.open('surge://');
    }
  }
}

// 运行主函数
await main();
Script.complete();
