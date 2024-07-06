name: Convert Surge Rules to Clash

# 当 push 操作发生在 conf/rule/surge/ 目录下时触发该工作流
on:
  push:
    paths:
      - 'conf/rule/surge/**'

jobs:
  convert:
    runs-on: ubuntu-latest

    steps:
    # 第一步：检出仓库代码
    - name: Checkout repository
      uses: actions/checkout@v3

    # 第二步：获取变更的文件列表
    - name: Get changed files
      id: changes
      run: |
        # 使用 git diff 命令获取变更的文件，并输出为一个 GitHub Actions 变量
        echo "::set-output name=files::$(git diff --name-only HEAD^ HEAD)"

    # 第三步：运行转换脚本，将 Surge 规则转换为 Clash 规则
    - name: Convert Surge rules to Clash
      run: python .github/scripts/convert_surge_to_clash.py "${{ steps.changes.outputs.files }}"

    # 第四步：将转换后的文件提交并推送到仓库
    - name: Commit and push changes
      run: |
        # 配置 Git 用户信息
        git config --global user.name 'github-actions[bot]'
        git config --global user.email 'github-actions[bot]@users.noreply.github.com'
        # 添加转换后的文件到 Git 暂存区
        git add conf/rule/clash/*
        # 提交更改
        git commit -m 'Convert Surge rules to Clash rules'
        # 推送到远程仓库
        git push
      env:
        # 使用 GitHub 提供的 GITHUB_TOKEN 进行身份验证
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}