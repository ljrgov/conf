import os
import sys

# 定义 Surge 和 Clash 规则文件夹路径
surge_rule_dir = 'conf/rule/surge'
clash_rule_dir = 'conf/rule/clash'

# 获取变更的文件列表，从命令行参数中传递
changed_files = sys.argv[1].split()

# 规则类型映射字典，将不支持的 USER-AGENT 规则类型转换为注释
rule_mapping = {
    'USER-AGENT': 'COMMENT',  # 不能转换的规则类型，转换为注释
    # 添加其他需要转换的规则类型映射
}

def convert_rule(line):
    """
    将 Surge 规则行转换为 Clash 规则行
    :param line: Surge 规则行
    :return: 转换后的 Clash 规则行
    """
    # 遍历规则类型映射字典，检查并转换规则
    for surge_type, clash_type in rule_mapping.items():
        if line.startswith(surge_type):
            if clash_type == 'COMMENT':
                # 如果规则类型为 COMMENT，则将该行转换为注释
                return f'# {line}'
            else:
                # 将 Surge 规则类型替换为 Clash 规则类型
                return line.replace(surge_type, clash_type)
    return line

# 如果 Clash 规则文件夹不存在，创建它
if not os.path.exists(clash_rule_dir):
    os.makedirs(clash_rule_dir)

# 处理变更的文件
for filepath in changed_files:
    # 确保文件在 Surge 规则文件夹中，并且以 .list 结尾
    if filepath.startswith(surge_rule_dir) and filepath.endswith('.list'):
        filename = os.path.basename(filepath)
        clash_file_path = os.path.join(clash_rule_dir, f'{os.path.splitext(filename)[0]}.txt')

        # 读取 Surge 规则文件内容
        with open(filepath, 'r', encoding='utf-8') as surge_file:
            lines = surge_file.readlines()

        # 转换规则
        converted_lines = [convert_rule(line) for line in lines]

        # 将转换后的规则写入 Clash 规则文件
        with open(clash_file_path, 'w', encoding='utf-8') as clash_file:
            clash_file.writelines(converted_lines)

print('Conversion completed.')  # 打印转换完成消息
