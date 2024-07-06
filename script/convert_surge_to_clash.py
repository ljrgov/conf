import os
import sys

def convert_surge_to_clash(surge_rules_path, clash_rules_path):
    # Ensure the output directory exists
    if not os.path.exists(clash_rules_path):
        os.makedirs(clash_rules_path)
    
    for filename in os.listdir(surge_rules_path):
        if filename.endswith('.txt'):
            surge_file_path = os.path.join(surge_rules_path, filename)
            clash_file_path = os.path.join(clash_rules_path, filename)

            with open(surge_file_path, 'r', encoding='utf-8') as surge_file:
                rules = surge_file.readlines()
            
            clash_rules = []
            for rule in rules:
                if 'USER-AGENT' in rule:
                    # Comment out USER-AGENT rules if conversion is not possible
                    clash_rules.append(f'# {rule}')
                else:
                    # Copy other rules directly (modify this as per your needs)
                    clash_rules.append(rule)
            
            with open(clash_file_path, 'w', encoding='utf-8') as clash_file:
                clash_file.writelines(clash_rules)
    
    print(f'Converted rules from {surge_rules_path} to {clash_rules_path}')

if __name__ == "__main__":
    surge_rules_path = sys.argv[1]
    clash_rules_path = sys.argv[2]
    convert_surge_to_clash(surge_rules_path, clash_rules_path)




