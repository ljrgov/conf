import os
import re

print("开始转换...")

# 定义文件路径
surge_rules_path = 'conf/rule/surge'  # Surge 规则文件夹路径
clash_rules_path = 'conf/rule/clash'  # 保存 Clash 规则的文件夹路径

print(f"Surge 规则路径: {surge_rules_path}")
print(f"Clash 规则路径: {clash_rules_path}")

# 读取 Surge 规则
def read_surge_rules(file_path):
    print(f"读取文件: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.readlines()

# 转换规则格式
def convert_to_clash(surge_rules):
    clash_rules = []
    for rule in surge_rules:
        rule = rule.strip()
        if rule.startswith('USER-AGENT'):
            # 尝试转换 USER-AGENT 规则
            match = re.match(r'USER-AGENT,\s*(.+?),\s*(.*)', rule)
            if match:
                user_agent, action = match.groups()
                # 这里可以添加具体的 USER-AGENT 转换逻辑
                # 如果无法转换，注释掉
                clash_rules.append(f"# {rule}")
                print(f"无法转换 USER-AGENT 规则: {rule}")
            else:
                clash_rules.append(f"# {rule}")
                print(f"无法解析 USER-AGENT 规则: {rule}")
        else:
            clash_rules.append(rule)
    return clash_rules

# 保存 Clash 规则
def save_clash_rules(clash_rules, output_path):
    print(f"保存文件到: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(clash_rules))

# 创建输出文件夹（如果不存在）
if not os.path.exists(clash_rules_path):
    os.makedirs(clash_rules_path)

# 获取所有 Surge 规则文件
surge_rule_files = [f for f in os.listdir(surge_rules_path) if f.endswith('.list')]

print(f"找到的 Surge 规则文件: {surge_rule_files}")

# 转换并保存每个规则文件
for surge_file in surge_rule_files:
    surge_file_path = os.path.join(surge_rules_path, surge_file)
    clash_file_path = os.path.join(clash_rules_path, surge_file.replace('.list', '.txt'))

    print(f"转换文件: {surge_file_path} 到 {clash_file_path}")

    surge_rules = read_surge_rules(surge_file_path)
    clash_rules = convert_to_clash(surge_rules)
    save_clash_rules(clash_rules, clash_file_path)

print("转换完成！")



