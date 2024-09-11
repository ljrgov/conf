// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.11";

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

async function createNewModule(url, name) {
  const fm = FileManager.iCloud();
  
  const req = new Request(url);
  req.timeoutInterval = 10;
  req.method = 'GET';
  let content = await req.loadString();
  
  // 始终设置初始分类为 '📚未分类'
  content = content.replace(/^#!category=.*?$/m, ''); // 移除现有的分类（如果有）
  content = content.replace(/^(#!name=.*?)(\n|$)/, `$1\n#!category=📚未分类$2`);
  
  content = `#SUBSCRIBED ${url}\n${content}`;
  
  const fileName = `${name}.sgmodule`;
  const filePath = fm.joinPath(fm.documentsDirectory(), fileName);
  fm.writeString(filePath, content);
  
  console.log(`已保存模块: ${fileName}`);
  
  // 使用延迟来确保文件保存后再进行分类
  await delay(100); // 100ms 延迟
  
  // 文件保存后进行分类
  await handleCategory(filePath, name);
  
  return { fileName, content: fm.readString(filePath) };
}

// 其他函数保持不变

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
      
      const { fileName, content } = await createNewModule(url, name);
      
      files = [fileName];
      contents = [content];
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

  // 处理文件的逻辑保持不变
  for (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      // ... 保持原有的处理逻辑不变
    }
  }

  // 结果报告逻辑保持不变
  if (!fromUrlScheme && idx !== 0) {
    // ... 保持原有的报告逻辑不变
  }
}

// 运行主函数
await main();
Script.complete();
