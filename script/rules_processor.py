"""
rules_processor.py  —  One-pass rules processor

Usage:
    python3 script/rules_processor.py <input.txt> <output.src> <output.json>

Stage 1: normalize raw rules/*.txt  →  temp_rules/*.src  (Mihomo format as internal standard)
Stage 2: generate sing-box JSON     →  sing-box/rules/*.json

Supported input formats:
    Mihomo / Surge / sing-box native formats
    Bare values (auto-detection)
    Adblock Plus syntax (partial, ## discarded, /path$domain= extracted)

Internal standard (Mihomo format):
    DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD / DOMAIN-WILDCARD / DOMAIN-REGEX / GEOSITE
    IP-CIDR / IP-CIDR6 / IP-SUFFIX / IP-ASN / GEOIP
    SRC-IP-CIDR / SRC-IP-CIDR6 / SRC-IP-SUFFIX / SRC-IP-ASN / SRC-GEOIP
    DST-PORT / SRC-PORT
    IN-PORT / IN-TYPE / IN-USER / IN-NAME
    PROCESS-NAME / PROCESS-NAME-WILDCARD / PROCESS-NAME-REGEX
    PROCESS-PATH / PROCESS-PATH-WILDCARD / PROCESS-PATH-REGEX
    UID / NETWORK / DSCP
    URL-REGEX
    RULE-SET / AND / OR / NOT / SUB-RULE / MATCH
"""

import sys
import re
import json
from urllib.parse import urlparse


# ── Wildcard → regex conversion ───────────────────────────────────────────────

def wildcard_to_regex(pattern: str) -> str:
    """Convert shell-style wildcard (* and ?) to regex string."""
    result = ""
    for ch in pattern:
        if ch == "*":
            result += ".*"
        elif ch == "?":
            result += "."
        elif ch in r"\.+^${}[]|()/":
            result += "\\" + ch
        else:
            result += ch
    return result


# ── Port range validator ──────────────────────────────────────────────────────

def is_port_value(value: str) -> bool:
    """Check if value is a valid port number, range (8000-9000), or list (80,443)."""
    value = value.strip()
    # Single port
    if value.isdigit():
        return int(value) <= 65535
    # Range: 8000-9000
    if re.match(r'^\d+-\d+$', value):
        a, b = value.split('-')
        return int(a) <= 65535 and int(b) <= 65535 and int(a) <= int(b)
    # List: 80,443,8080
    if re.match(r'^\d+(,\d+)+$', value):
        return all(p.isdigit() and int(p) <= 65535 for p in value.split(','))
    return False


# ── Process prefix normalizer ─────────────────────────────────────────────────

def normalize_process(prefix: str, value: str) -> str:
    """Normalize any PROCESS* prefix + value to internal standard."""
    prefix = prefix.upper().replace('_', '-')

    # Already a full standard prefix
    if prefix in ('PROCESS-NAME', 'PROCESS-NAME-WILDCARD', 'PROCESS-NAME-REGEX',
                  'PROCESS-PATH', 'PROCESS-PATH-WILDCARD', 'PROCESS-PATH-REGEX'):
        return f'{prefix},{value}'

    # Surge style: PROCESS-NAME with wildcard value → PROCESS-NAME-WILDCARD
    if prefix == 'PROCESS-NAME':
        if '*' in value or '?' in value:
            return f'PROCESS-NAME-WILDCARD,{value}'
        return f'PROCESS-NAME,{value}'

    # Generic PROCESS, prefix → detect by value
    if prefix == 'PROCESS':
        if value.startswith('/') or re.match(r'^[A-Za-z]:\\', value):
            if '*' in value or '?' in value:
                return f'PROCESS-PATH-WILDCARD,{value}'
            return f'PROCESS-PATH,{value}'
        if '*' in value or '?' in value:
            return f'PROCESS-NAME-WILDCARD,{value}'
        return f'PROCESS-NAME,{value}'

    # sing-box underscore style already handled by upper+replace above
    # fallback
    return f'PROCESS-NAME,{value}'


# ── URL / Adblock parser ──────────────────────────────────────────────────────

def parse_url_line(line: str) -> list:
    """
    Parse http(s):// lines and adblock /path$domain= lines.
    Returns a list of normalized rule strings.
    """
    out = []

    # Adblock: /path$domain=example.com
    adblock_path = re.match(r'^(/[^$]*)(?:\$.*)?$', line)
    if adblock_path and not line.startswith('//'):
        path = adblock_path.group(1)
        # Extract domain= if present
        domain_match = re.search(r'\$.*domain=([^,|~]+)', line)
        if domain_match:
            domain = domain_match.group(1).strip().lstrip('.')
            if domain:
                out.append(f'DOMAIN,{domain}')
        regex_val = re.sub(r'\d+', r'\\d+', path).replace('.', r'\.')
        out.append(f'URL-REGEX,{regex_val}')
        return out

    # http(s):// URL
    try:
        parsed = urlparse(line)
        host = parsed.hostname or ''
        path = parsed.path or ''

        if host:
            if '*' in host or '?' in host:
                out.append(f'DOMAIN-WILDCARD,{host}')
            else:
                out.append(f'DOMAIN,{host}')

        if path and path != '/':
            regex_val = re.sub(r'\d+', r'\\d+', path).replace('.', r'\.')
            out.append(f'URL-REGEX,{regex_val}')
    except Exception:
        pass

    return out


# ── Stage 1: normalize ────────────────────────────────────────────────────────

def normalize(src_path: str) -> list:
    """Read raw txt, return normalized list of TYPE,value lines (Mihomo internal standard)."""

    re_strip_comment = re.compile(r'\s*//.*$')
    re_no_resolve    = re.compile(r',no-resolve\b', re.IGNORECASE)
    re_ipv4          = re.compile(r'^(\d{1,3}\.){3}\d{1,3}(/\d+)?$')

    # IP rule types that require ,no-resolve in Mihomo/Surge output
    IP_NO_RESOLVE = {
        'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX',
        'SRC-IP-CIDR', 'SRC-IP-CIDR6', 'SRC-IP-SUFFIX',
        'IP-ASN', 'SRC-IP-ASN',
        'GEOIP', 'SRC-GEOIP',
    }
    re_ipv6          = re.compile(r'^[0-9a-fA-F:]+:[0-9a-fA-F:]*/?\d*$')
    re_domain_like   = re.compile(r'\.[a-z]{2,}$', re.IGNORECASE)

    # Prefix aliases → internal standard
    PREFIX_ALIAS = {
        'DEST-PORT':    'DST-PORT',
        'PORT':         'DST-PORT',
        # sing-box underscore style
        'DOMAIN_SUFFIX':          'DOMAIN-SUFFIX',
        'DOMAIN_KEYWORD':         'DOMAIN-KEYWORD',
        'DOMAIN_REGEX':           'DOMAIN-REGEX',
        'IP_CIDR':                'IP-CIDR',
        'IP_CIDR6':               'IP-CIDR6',
        'IP_SUFFIX':              'IP-SUFFIX',
        'IP_ASN':                 'IP-ASN',
        'SOURCE_IP_CIDR':         'SRC-IP-CIDR',
        'SRC_IP_CIDR':            'SRC-IP-CIDR',
        'SOURCE_PORT':            'SRC-PORT',
        'SRC_PORT':               'SRC-PORT',
        'PROCESS_NAME':           'PROCESS-NAME',
        'PROCESS_PATH':           'PROCESS-PATH',
        'PROCESS_PATH_REGEX':     'PROCESS-PATH-REGEX',
    }

    # Prefixes that pass through as-is (Mihomo standard)
    PASS_THROUGH = {
        'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'DOMAIN-REGEX',
        'GEOSITE', 'GEOIP',
        'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'IP-ASN',
        'SRC-IP-CIDR', 'SRC-IP-CIDR6', 'SRC-IP-SUFFIX', 'SRC-IP-ASN', 'SRC-GEOIP',
        'DST-PORT', 'SRC-PORT',
        'IN-PORT', 'IN-TYPE', 'IN-USER', 'IN-NAME',
        'UID', 'NETWORK', 'DSCP',
        'URL-REGEX',
        'RULE-SET', 'AND', 'OR', 'NOT', 'SUB-RULE', 'MATCH',
    }

    def emit(prefix: str, value: str) -> str:
        """Return normalized rule string, appending ,no-resolve for IP types."""
        rule = f'{prefix},{value}'
        if prefix in IP_NO_RESOLVE:
            rule += ',no-resolve'
        return rule

    out = []

    with open(src_path, encoding='utf-8', errors='replace') as f:
        for raw in f:
            line = raw.strip()

            # Strip no-resolve (we re-add it ourselves for IP rules) and trailing policy
            line = re_no_resolve.sub('', line)
            line = re_strip_comment.sub('', line).strip()

            if not line or line.startswith('#') or line.startswith(';'):
                continue

            # ── Adblock element hiding (##) → discard ────────────────────────
            if '##' in line:
                continue

            # ── Explicit prefix ───────────────────────────────────────────────
            comma = line.find(',')
            if comma != -1:
                raw_prefix = line[:comma]
                # Normalize underscores to dashes for lookup
                prefix_dash = raw_prefix.upper().replace('_', '-')
                value = line[comma+1:]

                # Strip trailing policy from value (,DIRECT / ,PROXY / ,REJECT / ,auto / ,<UPPERCASE>)
                value = re.sub(r',(DIRECT|PROXY|REJECT|auto|[A-Z][A-Z0-9_-]*)$', '', value, flags=re.IGNORECASE)

                # Alias remapping
                if prefix_dash in PREFIX_ALIAS:
                    prefix_dash = PREFIX_ALIAS[prefix_dash]

                # PROCESS* family
                if prefix_dash.startswith('PROCESS'):
                    out.append(normalize_process(prefix_dash, value))
                    continue

                # Pass-through
                if prefix_dash in PASS_THROUGH:
                    out.append(emit(prefix_dash, value))
                    continue

                # Unknown explicit prefix → pass through as-is
                if re.match(r'^[A-Z][A-Z0-9-]+$', prefix_dash):
                    out.append(emit(prefix_dash, value))
                    continue

            # ── Adblock /path$domain= ─────────────────────────────────────────
            if line.startswith('/') and not line.startswith('//'):
                out.extend(parse_url_line(line))
                continue

            # ── http(s):// URL ────────────────────────────────────────────────
            if line.startswith('http://') or line.startswith('https://'):
                out.extend(parse_url_line(line))
                continue

            # ── Bare value guessing ───────────────────────────────────────────

            # Wildcard domain
            if '*' in line or '?' in line:
                out.append(f'DOMAIN-WILDCARD,{line}')
                continue

            # Bare IPv4
            if re_ipv4.match(line):
                if '/' not in line:
                    line += '/32'
                out.append(emit('IP-CIDR', line))
                continue

            # Bare IPv6
            if re_ipv6.match(line) and ':' in line:
                if '/' not in line:
                    line += '/128'
                out.append(emit('IP-CIDR6', line))
                continue

            # Port number / range / list
            if is_port_value(line):
                out.append(f'DST-PORT,{line}')
                continue

            # .suffix → DOMAIN-SUFFIX
            if line.startswith('.'):
                out.append(f'DOMAIN-SUFFIX,{line[1:]}')
                continue

            # domain-like → DOMAIN
            if re_domain_like.search(line):
                out.append(f'DOMAIN,{line}')
                continue

            # fallback → DOMAIN-KEYWORD
            out.append(f'DOMAIN-KEYWORD,{line}')

    return out


# ── Stage 2: build sing-box JSON ──────────────────────────────────────────────

def parse_ports_for_singbox(port_values: list) -> tuple:
    """
    Split port values into sing-box port (int list) and port_range (string list).
    Mihomo format  →  sing-box format:
      single:  "80"        →  port: [80]
      range:   "8000-9000" →  port_range: ["8000:9000"]
      list:    "80,443"    →  port: [80, 443]
    """
    ports = []
    port_ranges = []
    for val in port_values:
        val = val.strip()
        if re.match(r'^\d+-\d+$', val):
            a, b = val.split('-')
            port_ranges.append(f'{a}:{b}')
        elif ',' in val:
            for p in val.split(','):
                p = p.strip()
                if p.isdigit():
                    ports.append(int(p))
        elif val.isdigit():
            ports.append(int(val))
    return sorted(set(ports)), sorted(set(port_ranges))


def build_singbox(src_lines: list) -> dict:
    """Convert normalized lines to sing-box rule-set dict."""

    def strip_no_resolve(s: str) -> str:
        """Remove trailing ,no-resolve (sing-box doesn't use it)."""
        return re.sub(r',no-resolve$', '', s, flags=re.IGNORECASE)

    domains         = []
    suffixes        = []
    keywords        = []
    wildcards       = []
    ipv4s           = []
    ipv6s           = []
    src_ip_cidrs    = []
    dst_ports       = []
    src_ports       = []
    process_names   = []
    process_paths   = []
    process_path_re = []
    networks        = []

    for line in src_lines:
        if line.startswith("DOMAIN,"):
            domains.append(line[7:])
        elif line.startswith("DOMAIN-SUFFIX,"):
            suffixes.append(line[14:])
        elif line.startswith("DOMAIN-KEYWORD,"):
            keywords.append(line[15:])
        elif line.startswith("DOMAIN-WILDCARD,"):
            wildcards.append(line[16:])
        elif line.startswith("IP-CIDR6,"):
            ipv6s.append(strip_no_resolve(line[9:]))
        elif line.startswith("IP-CIDR,"):
            val = strip_no_resolve(line[8:])
            if ':' in val:
                ipv6s.append(val)
            else:
                ipv4s.append(val)
        elif line.startswith("SRC-IP-CIDR,"):
            src_ip_cidrs.append(strip_no_resolve(line[12:]))
        elif line.startswith("DST-PORT,"):
            dst_ports.append(line[9:].strip())
        elif line.startswith("SRC-PORT,"):
            src_ports.append(line[9:].strip())
        elif line.startswith("PROCESS-NAME,"):
            process_names.append(line[13:])
        elif line.startswith("PROCESS-PATH,"):
            process_paths.append(line[13:])
        elif line.startswith("PROCESS-PATH-REGEX,"):
            process_path_re.append(line[19:])
        elif line.startswith("NETWORK,"):
            networks.append(line[8:].lower())
        # URL-REGEX, GEOIP, GEOSITE, IN-*, UID, DSCP,
        # PROCESS-NAME-WILDCARD/REGEX, PROCESS-PATH-WILDCARD,
        # SRC-IP-CIDR6/SUFFIX/ASN, SRC-GEOIP, IP-SUFFIX, IP-ASN,
        # AND/OR/NOT, RULE-SET, SUB-RULE, MATCH → not supported in headless rule, skip

    regexes = [wildcard_to_regex(w) for w in wildcards]
    ip_cidrs_sorted = sorted(set(ipv4s)) + sorted(set(ipv6s))

    dst_port_list,  dst_port_range_list = parse_ports_for_singbox(dst_ports)
    src_port_list,  src_port_range_list = parse_ports_for_singbox(src_ports)

    rules = []
    if domains:
        rules.append({"domain":             sorted(set(domains))})
    if suffixes:
        rules.append({"domain_suffix":      sorted(set(suffixes))})
    if keywords:
        rules.append({"domain_keyword":     sorted(set(keywords))})
    if regexes:
        rules.append({"domain_regex":       sorted(set(regexes))})
    if ip_cidrs_sorted:
        rules.append({"ip_cidr":            ip_cidrs_sorted})
    if src_ip_cidrs:
        rules.append({"source_ip_cidr":     sorted(set(src_ip_cidrs))})
    if dst_port_list:
        rules.append({"port":               dst_port_list})
    if dst_port_range_list:
        rules.append({"port_range":         dst_port_range_list})
    if src_port_list:
        rules.append({"source_port":        src_port_list})
    if src_port_range_list:
        rules.append({"source_port_range":  src_port_range_list})
    if process_names:
        rules.append({"process_name":       sorted(set(process_names))})
    if process_paths:
        rules.append({"process_path":       sorted(set(process_paths))})
    if process_path_re:
        rules.append({"process_path_regex": sorted(set(process_path_re))})
    if networks:
        rules.append({"network":            sorted(set(networks))})

    return {"version": 2, "rules": rules}


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    txt_file  = sys.argv[1]   # input:  rules/*.txt
    src_file  = sys.argv[2]   # output: temp_rules/*.src
    json_file = sys.argv[3]   # output: sing-box/rules/*.json

    # Stage 1
    lines = normalize(txt_file)
    with open(src_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
        if lines:
            f.write('\n')
    print(f"  标准化完成，共 {len(lines)} 条有效规则")

    # Stage 2
    result = build_singbox(lines)
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    rule_count = len(result['rules'])
    regex_count = next(
        (len(r['domain_regex']) for r in result['rules'] if 'domain_regex' in r), 0
    )
    print(f"  JSON 已生成，共 {rule_count} 个规则块"
          + (f"（含 {regex_count} 条 domain_regex）" if regex_count else ""))


if __name__ == "__main__":
    main()