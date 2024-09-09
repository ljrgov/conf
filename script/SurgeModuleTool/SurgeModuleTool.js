// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.4";

let cancelled = false; // 标记是否已取消

async function handleCategory(content) {
  const categoryRegex = /^#\!category\s*?=\s*(.*?)\s*(\n|$)/im;
  const categoryMatch = content.match(categoryRegex);
  let categoryValue = "📚未分类";

  // 如果有category字段，替换为 "📚未分类"
  if (categoryMatch) {
    content = content.replace(categoryRegex, `#!category=${categoryValue}\n`);
  } else {
    // 如果没有category字段，添加到第三行
    const lines = content.split("\n");
    lines.splice(2, 0, `#!category=${categoryValue}`);
    content = lines.join("\n");
  }

  // 弹出选择对话框
  const alert = new Alert();
  alert.title = "选择分类";
  alert.addAction("📕 广告模块");
  alert.addAction("📗 功能模块");
  alert.addAction("📘 面板模块");
  alert.addAction("📚 默认分类");
  alert.addCancelAction("取消");

  const idx = await alert.presentAlert();
  
  if (cancelled) return content; // 如果已取消，直接返回原内容

  // 用户选择的分类
  if (idx !== -1) { // 如果用户点击了取消按钮则跳过
    if (idx === 0) {
      categoryValue = "📕 广告模块";
    } else if (idx === 1) {
      categoryValue = "📗 功能模块";
    } else if (idx === 2) {
      categoryValue = "📘 面板模块";
    }
    // 如果选择默认分类，不修改categoryValue，保持“📚未分类”或原值
    content = content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${categoryValue}\n`);
  }

  return content;
}

// 其他函数保持不变...

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
  
  if (cancelled) return; // 如果已取消，终止操作
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
    await alert.presentAlert();
    
    if (cancelled) return; // 如果已取消，终止操作

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
  
  if (cancelled) return; // 如果已取消，终止操作
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
      const originalNameMatched = `${content}`.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalNameMatched) {
        originalName = originalNameMatched[1];
      }
      const originalDescMatched = `${content}`.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalDescMatched) {
        originalDesc = originalDescMatched[1].replace(/^🔗.*?]\s*/i, '');
      }
      const matched = `${content}`.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
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
        throw new Error('未获取到模块内容');
      }

      const nameMatched = `${res}`.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      if (!nameMatched) {
        throw new Error('不是合法的模块内容');
      }
      const name = nameMatched[1];
      if (!name) {
        throw new Error('模块无名称字段');
      }
      const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      let desc;
      if (descMatched) {
        desc = descMatched[1];
      }
      if (!desc) {
        res = `#!desc=\n${res}`;
      }
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
      content = `${res}`.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);
      
      // 处理category部分
      content = await handleCategory(content);
      
      if (cancelled) return; // 如果已取消，终止操作

      if (filePath) {
        fm.writeString(filePath, content);
      } else {
        await DocumentPicker.exportString(content, file);
      }

      let nameInfo = `${name}`;
      let descInfo = `${desc}`;
      
      // 如果名称或描述有更新，显示变化
      if (originalName && name !== originalName) {
        nameInfo = `${originalName} -> ${name}`;
      }
      if (originalDesc && desc !== originalDesc) {
        descInfo = `${originalDesc} -> ${desc}`;
      }

      // 成功处理后的日志输出
      console.log(`\n✅ ${nameInfo}\n${descInfo}\n${file}`);
      report.success++;

      // 延迟1秒
      await delay(1 * 1000);

      // 如果从 URL Scheme 启动
      if (fromUrlScheme) {
        alert = new Alert();
        alert.title = `✅ ${nameInfo}`;
        alert.message = `${descInfo}\n${file}`;
        alert.addDestructiveAction('重载 Surge');
        alert.addAction('打开 Surge');
        alert.addCancelAction('关闭');
        
        // 弹出对话框，等待用户选择
        idx = await alert.presentAlert();
        
        if (cancelled) return; // 如果已取消，终止操作
        
        // 根据用户选择，执行操作
        if (idx == 0) {
          const req = new Request('http://script.hub/reload');
          req.timeoutInterval = 10;
          req.method = 'GET';
          let res = await req.loadString();
        } else if (idx == 1) {
          Safari.open('surge://');
        }
      }
    } catch (e) {
      // 如果没有 URL，增加到无链接计数
      if (noUrl) {
        report.noUrl++;
      } else {
        // 记录处理失败的模块
        report.fail.push(`${file} ${e}`);
      }

      // 记录具体错误信息
      if (noUrl) {
        console.log(`\n🈚️ ${originalName || ''}\n${file}`);
        console.log(e);
      } else {
        console.log(`\n❌ ${originalName || ''}\n${file}`);
        console.error(`${originalName || file}: ${e}`);
      }

      // 如果从 URL Scheme 启动，弹出错误对话框
      if (fromUrlScheme) {
        alert = new Alert();
        alert.title = `❌ ${originalName || ''}\n${file}`;
        alert.message = `${e.message || e}`;
        alert.addCancelAction('关闭');
        await alert.presentAlert();
        
        if (cancelled) return; // 如果已取消，终止操作
      }
    }
  }
}

// 最终报告
if (!checkUpdate && !fromUrlScheme) {
  alert = new Alert();
  
  // 根据失败和无链接的情况组织最终报告的内容
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '',
    noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';

  // 总的模块处理情况
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
    report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
  }`;

  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');

  // 等待用户选择操作
  idx = await alert.presentAlert();
  
  if (cancelled) return; // 如果已取消，终止操作

  // 根据用户选择，执行相应操作
  if (idx == 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    let res = await req.loadString();
  } else if (idx == 1) {
    Safari.open('surge://');
  }
}

// 监听取消按钮
function handleCancel() {
  cancelled = true;
}

document.addEventListener('cancel', handleCancel);



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



