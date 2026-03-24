# 规则集格式化（sing-box、surge、mihomo）
import sys
import re
import json
import subprocess
import os
import gzip
import urllib.request
import time

# ── BGP 数据源配置 ────────────────────────────────────────────────
BGP_TABLE_PATH = os.environ.get("BGP_TABLE_PATH", "/tmp/bgp_table.jsonl")
BGP_MIN_LINES  = 100_000
_ripestat_cache: dict[int, list[str]] = {}


# ── 主源：bgp.tools ───────────────────────────────────────────────
def _try_bgptools() -> bool:
    url = "https://bgp.tools/table.jsonl"
    headers = {
        "User-Agent": "route-collector/1.0 (github.com/ljrgov/conf; BGP prefix lookup)",
        "Accept": "application/json, text/plain, */*",
    }
    print("尝试从 bgp.tools 下载...", file=sys.stderr)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp, \
             open(BGP_TABLE_PATH, "wb") as f:
            f.write(resp.read())
        with open(BGP_TABLE_PATH, "rb") as f:
            lines = sum(1 for _ in f)
        if lines > BGP_MIN_LINES:
            print(f"✓ bgp.tools 成功 ({lines:,} 行)", file=sys.stderr)
            return True
        print(f"! bgp.tools 行数不足 ({lines:,})", file=sys.stderr)
    except Exception as e:
        print(f"! bgp.tools 失败: {e}", file=sys.stderr)
    return False


# ── 备用主源：RIPE NCC RIS whois dump ────────────────────────────
def _try_ripe_ris() -> bool:
    print("尝试从 RIPE NCC RIS 下载...", file=sys.stderr)
    v4_gz = "/tmp/ris_ipv4.gz"
    v6_gz = "/tmp/ris_ipv6.gz"
    try:
        urllib.request.urlretrieve(
            "https://www.ris.ripe.net/dumps/riswhoisdump.IPv4.gz", v4_gz)
        urllib.request.urlretrieve(
            "https://www.ris.ripe.net/dumps/riswhoisdump.IPv6.gz", v6_gz)

        count = 0
        with open(BGP_TABLE_PATH, "w", encoding="utf-8") as out_f:
            for gz_path in [v4_gz, v6_gz]:
                if not os.path.exists(gz_path):
                    continue
                with gzip.open(gz_path, "rt", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("%"):
                            continue
                        parts = line.split()
                        if len(parts) < 2:
                            continue
                        cidr = asn_val = ""
                        for p in parts:
                            p_clean = p.upper().replace("AS", "").split(",")[0]
                            if "/" in p:
                                cidr = p
                            elif p_clean.isdigit():
                                asn_val = int(p_clean)
                        if cidr and asn_val:
                            out_f.write(json.dumps({"CIDR": cidr, "ASN": asn_val}) + "\n")
                            count += 1

        if count > BGP_MIN_LINES:
            print(f"✓ RIPE NCC RIS 成功 ({count:,} 条)", file=sys.stderr)
            return True
        print(f"! RIPE NCC RIS 条目不足 ({count:,})", file=sys.stderr)
    except Exception as e:
        print(f"! RIPE NCC RIS 失败: {e}", file=sys.stderr)
    return False


def ensure_bgp_table() -> None:
    if os.path.exists(BGP_TABLE_PATH):
        try:
            with open(BGP_TABLE_PATH, "rb") as f:
                if sum(1 for _ in f) > BGP_MIN_LINES:
                    return
        except Exception:
            pass

    print(f"BGP 表缺失或过小，开始初始化 → {BGP_TABLE_PATH}", file=sys.stderr)

    if _try_bgptools():
        return
    if _try_ripe_ris():
        return

    print("WARNING: 离线 BGP 表初始化失败，将完全依赖 RIPE stat API 在线补查",
          file=sys.stderr)
    open(BGP_TABLE_PATH, "w").close()


# ── RIPE stat API：单 ASN 在线补查 ───────────────────────────────
def _fetch_ripestat(asn: int) -> list[str]:
    if asn in _ripestat_cache:
        return _ripestat_cache[asn]

    url = f"https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS{asn}"
    headers = {
        "User-Agent": "route-collector/1.0 (github.com/ljrgov/conf; BGP prefix lookup)",
    }
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read())
            prefixes = [
                p["prefix"]
                for p in data.get("data", {}).get("prefixes", [])
                if "prefix" in p
            ]
            print(f"  RIPE stat AS{asn}: {len(prefixes)} 条前缀", file=sys.stderr)
            _ripestat_cache[asn] = prefixes
            return prefixes
        except Exception as e:
            wait = 2 ** attempt
            print(f"  RIPE stat AS{asn} 第{attempt+1}次失败: {e}，{wait}s 后重试",
                  file=sys.stderr)
            if attempt < 2:
                time.sleep(wait)

    print(f"WARNING: RIPE stat AS{asn} 查询彻底失败，跳过", file=sys.stderr)
    _ripestat_cache[asn] = []
    return []


# ── ASN → CIDR 查询 ───────────────────────────────────────────────
_asn_table: dict[int, list[str]] | None = None


def _load_asn_table() -> dict[int, list[str]]:
    global _asn_table
    if _asn_table is not None:
        return _asn_table

    ensure_bgp_table()
    table: dict[int, list[str]] = {}

    if os.path.exists(BGP_TABLE_PATH):
        with open(BGP_TABLE_PATH, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    table.setdefault(int(obj["ASN"]), []).append(obj["CIDR"])
                except (KeyError, ValueError, json.JSONDecodeError):
                    continue

    _asn_table = table
    return table


def asn_to_cidrs(asn: int) -> list[str]:
    table = _load_asn_table()
    cidrs = table.get(asn)
    if cidrs:
        return cidrs

    print(f"  离线表未找到 AS{asn}，尝试 RIPE stat 在线补查...", file=sys.stderr)
    cidrs = _fetch_ripestat(asn)
    if cidrs:
        table[asn] = cidrs
    return cidrs


# ── 工具函数 ──────────────────────────────────────────────────────
def wildcard_to_regex(pattern: str) -> str:
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
    return f"^{result}$"


def parse_or_asn(line: str) -> list[int] | None:
    if not line.upper().startswith("OR,"):
        return None
    inner = line[3:].strip()
    if not (inner.startswith("(") and inner.endswith(")")):
        return None
    inner = inner[1:-1]
    re_item = re.compile(
        r"\(\s*IP-ASN\s*,\s*(\d+)\s*(?:,no-resolve)?\s*\)",
        re.IGNORECASE,
    )
    asns = []
    for item in re.findall(r"\([^)]*\)", inner):
        m = re_item.fullmatch(item.strip())
        if m:
            asns.append(int(m.group(1)))
        else:
            return None
    return asns if asns else None


# ── 规则规范化 ────────────────────────────────────────────────────
# 已知前缀的完整列表（用于判断是否是结构化前缀行）
_RE_KNOWN_PREFIX = re.compile(
    r"^(DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|KEYWORD|DOMAIN-WILDCARD|"
    r"IP-CIDR6?|IP-ASN|GEOIP|SRC-IP|"
    r"DST-PORT|SRC-PORT|"
    r"PROCESS(?:-NAME|-PATH(?:-WILDCARD)?)?|PN|"
    r"PATH(?:-WILDCARD)?|"
    r"URL-REGEX|USER-AGENT|"
    r"OR),",
    re.IGNORECASE,
)

# 端口范围匹配
_RE_PORT_RANGE = re.compile(r"^\d+[-:]\d+$")

# 含 PORT 的前缀
_RE_PORT_PREFIX = re.compile(r"^(DST-PORT|SRC-PORT),", re.IGNORECASE)

# IP-ASN 前缀（含各种别名）
_RE_ASN_PREFIX = re.compile(r"^IP-ASN,", re.IGNORECASE)

# 进程相关前缀（含 PN 别名）
_RE_PROCESS_PREFIX = re.compile(
    r"^(PROCESS(?:-NAME)?|PN),", re.IGNORECASE
)

# PATH 前缀（识别为 PROCESS-PATH）
_RE_PATH_PREFIX = re.compile(
    r"^(PATH(?:-WILDCARD)?),", re.IGNORECASE
)

# 裸 AS 数字：必须有 AS 前缀，避免与端口混淆
_RE_BARE_ASN = re.compile(r"^AS(\d+)$", re.IGNORECASE)

_RE_IPV4 = re.compile(r"^(\d{1,3}\.){3}\d{1,3}(/\d+)?$")
# 匹配标准 IPv6（含压缩格式 ::1、::、2001:db8::/32 等）
_RE_IPV6 = re.compile(r"^[0-9a-fA-F]*(?::[0-9a-fA-F]*){2,}(/\d+)?$")


def normalize(src_path: str) -> list[str]:
    """
    将源文件中各种格式的规则统一规范化为内部标准格式。

    内部标准格式说明：
    - IP/ASN/GEOIP/SRC-IP 类：带 ,no-resolve 后缀
    - PORT 类：带 ,no-resolve 后缀（surge/mihomo 需要；sing-box 输出时忽略）
    - 域名/进程类：不带 no-resolve
    - OR 规则：原样保留（各平台自行处理）
    """
    out = []

    with open(src_path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.strip()
            # 去除行内注释（// 风格，但不误删 URL 中的 //）
            # 只去除"空格/制表符后跟 //"，避免破坏 URL-REGEX 等规则值
            line = re.sub(r"\s+//.*$", "", line)
            # 去除已有的 no-resolve（统一在后面按需重新添加）
            line = re.sub(r",\s*no-resolve", "", line, flags=re.IGNORECASE)
            # 跳过空行和注释行
            if not line or line.startswith(("#", ";", "##")):
                continue

            upper = line.upper()

            # ① OR 规则：原样保留
            if upper.startswith("OR,"):
                out.append(line)
                continue

            # ② PROCESS-NAME / PN 前缀
            m = _RE_PROCESS_PREFIX.match(line)
            if m:
                value = line[len(m.group(0)):].strip()
                out.append(f"PROCESS-NAME,{value}")
                continue

            # ③ PATH / PATH-WILDCARD 前缀 → PROCESS-PATH / PROCESS-PATH-WILDCARD
            m = _RE_PATH_PREFIX.match(line)
            if m:
                prefix_src = m.group(1).upper()
                value = line[len(m.group(0)):].strip()
                if prefix_src == "PATH-WILDCARD" or "*" in value or "?" in value:
                    out.append(f"PROCESS-PATH-WILDCARD,{value}")
                else:
                    out.append(f"PROCESS-PATH,{value}")
                continue

            # ④ 裸 AS 数字（必须有 AS 前缀，避免与端口混淆）
            m = _RE_BARE_ASN.match(line)
            if m:
                out.append(f"IP-ASN,{m.group(1)},no-resolve")
                continue

            # ⑤ 纯数字或端口范围 -> 端口
            if re.fullmatch(r"\d+", line) or _RE_PORT_RANGE.match(line):
                val = line.replace(":", "-")
                out.append(f"DST-PORT,{val},no-resolve")
                continue

            # ⑥ 已知结构化前缀
            if _RE_KNOWN_PREFIX.match(line):
                p, v = line.split(",", 1)
                p = p.upper().replace("_", "-")

                # 规范化别名
                if p == "PN":
                    p = "PROCESS-NAME"
                elif p.endswith("KEYWORD"):
                    p = "DOMAIN-KEYWORD"
                elif p == "PATH":
                    p = "PROCESS-PATH-WILDCARD" if ("*" in v or "?" in v) else "PROCESS-PATH"
                elif p == "PATH-WILDCARD":
                    p = "PROCESS-PATH-WILDCARD"

                # 需要 no-resolve 的类型
                if p in ("IP-CIDR", "IP-CIDR6", "IP-ASN", "GEOIP", "SRC-IP",
                         "DST-PORT", "SRC-PORT"):
                    out.append(f"{p},{v},no-resolve")
                else:
                    out.append(f"{p},{v}")
                continue

            # ⑦ 裸值判断
            if _RE_IPV4.match(line):
                cidr = line if "/" in line else f"{line}/32"
                out.append(f"IP-CIDR,{cidr},no-resolve")
            elif _RE_IPV6.match(line):
                cidr = line if "/" in line else f"{line}/128"
                out.append(f"IP-CIDR6,{cidr},no-resolve")
            elif "/" in line or ":\\" in line:
                pfx = ("PROCESS-PATH-WILDCARD"
                       if ("*" in line or "?" in line) else "PROCESS-PATH")
                out.append(f"{pfx},{line}")
            elif "," in line:
                out.append(line)
            elif line.startswith("."):
                out.append(f"DOMAIN-SUFFIX,{line[1:]}")
            elif "*" in line or "?" in line:
                out.append(f"DOMAIN-WILDCARD,{line}")
            elif "." not in line:
                out.append(f"DOMAIN-KEYWORD,{line}")
            else:
                # 兜底：含点且无通配符，判定为完整域名
                out.append(f"DOMAIN,{line}")

    return out


# ── 排序权重（性能优先：域名 > 进程 > IP/端口） ──────────────────
_SORT_ORDER = {
    "DOMAIN":                0,
    "DOMAIN-SUFFIX":         1,
    "DOMAIN-KEYWORD":        2,
    "DOMAIN-WILDCARD":       3,
    "PROCESS-NAME":          4,
    "PROCESS-PATH":          5,
    "PROCESS-PATH-WILDCARD": 6,
    "URL-REGEX":             7,
    "USER-AGENT":            8,
    "GEOIP":                 9,
    "SRC-IP":               10,
    "IP-CIDR":              11,
    "IP-CIDR6":             12,
    "IP-ASN":               13,
    "DST-PORT":             14,
    "SRC-PORT":             15,
    "OR":                   16,
}


def _rule_sort_key(rule: str) -> int:
    prefix = rule.split(",", 1)[0].upper()
    return _SORT_ORDER.get(prefix, 99)


def sort_rules(rules: list[str]) -> list[str]:
    return sorted(rules, key=_rule_sort_key)


# ── 主逻辑 ────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <源文件路径>", file=sys.stderr)
        return

    input_path = sys.argv[1]
    filename   = os.path.splitext(os.path.basename(input_path))[0]
    std_rules  = normalize(input_path)

    # ── Surge（5/6 兼容）────────────────────────────────────────
    # 支持类型：域名、IP、ASN、GEOIP、SRC-IP、端口、进程、URL-REGEX、OR
    # no-resolve：IP/ASN/GEOIP/SRC-IP/端口 类保留；OR 子项恢复
    SURGE_ALLOWED_PREFIXES = {
        "DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "DOMAIN-WILDCARD",
        "IP-CIDR", "IP-CIDR6", "IP-ASN", "GEOIP", "SRC-IP",
        "DST-PORT", "SRC-PORT",
        "PROCESS-NAME", "PROCESS-PATH", "PROCESS-PATH-WILDCARD",
        "URL-REGEX", "USER-AGENT",
        "OR",
    }

    surge_res = []
    for rule in std_rules:
        prefix = rule.split(",", 1)[0].upper()
        if prefix not in SURGE_ALLOWED_PREFIXES:
            continue

        if prefix == "PROCESS-PATH-WILDCARD":
            # Surge 不支持 PROCESS-PATH-WILDCARD，降级为 PROCESS-PATH
            surge_res.append(rule.replace("PROCESS-PATH-WILDCARD,", "PROCESS-PATH,", 1))
        elif prefix == "OR":
            # OR 子项的 IP-ASN 需要补回 no-resolve
            restored = re.sub(
                r"(IP-ASN,\d+)(\s*\))",
                r"\1,no-resolve\2",
                rule,
                flags=re.IGNORECASE,
            )
            surge_res.append(restored)
        else:
            surge_res.append(rule)

    surge_res = sort_rules(surge_res)
    os.makedirs("surge/rules", exist_ok=True)
    with open(f"surge/rules/{filename}.list", "w", encoding="utf-8") as f:
        f.write("\n".join(surge_res) + "\n")

    # ── Mihomo（1.19.20+）────────────────────────────────────────
    # 不支持：URL-REGEX（Mihomo 实际支持，保留）
    # 不支持：USER-AGENT（已废弃，忽略）
    # OR 规则：Mihomo 支持，保留
    # no-resolve：IP/ASN/GEOIP/SRC-IP/端口 类保留
    MIHOMO_UNSUPPORTED = {"USER-AGENT"}

    mihomo_res = []
    for rule in std_rules:
        prefix = rule.split(",", 1)[0].upper()
        if prefix in MIHOMO_UNSUPPORTED:
            continue
        mihomo_res.append(rule)

    mihomo_res = sort_rules(mihomo_res)
    os.makedirs("mihomo/rules", exist_ok=True)
    with open(f"mihomo/rules/{filename}.list", "w", encoding="utf-8") as f:
        f.write("\n".join(mihomo_res) + "\n")

    # ── Sing-box（1.13+）────────────────────────────────────────
    # sing-box 规则集字段说明：
    #   domain / domain_suffix / domain_keyword / domain_regex
    #   ip_cidr（IPv4 + IPv6 合并）
    #   process_name / process_path / process_path_regex
    #   port / source_port（1.13+ 支持）
    #   不支持：GEOIP（需单独 geoip 规则集）、SRC-IP、USER-AGENT、URL-REGEX、OR（展开为 CIDR）
    # 不带 no-resolve（sing-box 无此概念）

    d, ds, dk, dr = [], [], [], []
    ip_all = []
    pn, pp, ppw = [], [], []
    dst_ports, src_ports = [], []

    for rule in std_rules:
        upper = rule.upper()

        # OR 规则：尝试展开纯 IP-ASN OR
        if upper.startswith("OR,"):
            asns = parse_or_asn(rule)
            if asns:
                for asn in asns:
                    ip_all.extend(asn_to_cidrs(asn))
            else:
                print(f"WARNING: sing-box 不支持非纯ASN的 OR 规则，已跳过: {rule}",
                      file=sys.stderr)
            continue

        # 去除 no-resolve 后缀再解析
        clean = re.sub(r",\s*no-resolve", "", rule, flags=re.IGNORECASE)
        if "," not in clean:
            continue
        p, v = clean.split(",", 1)
        p = p.upper()

        if p == "DOMAIN":
            d.append(v)
        elif p == "DOMAIN-SUFFIX":
            ds.append(v)
        elif p == "DOMAIN-KEYWORD":
            dk.append(v)
        elif p == "DOMAIN-WILDCARD":
            dr.append(wildcard_to_regex(v))
        elif p == "IP-CIDR":
            ip_all.append(v)
        elif p == "IP-CIDR6":
            ip_all.append(v)
        elif p == "IP-ASN":
            ip_all.extend(asn_to_cidrs(int(v)))
        elif p == "PROCESS-NAME":
            pn.append(v)
        elif p == "PROCESS-PATH":
            pp.append(v)
        elif p == "PROCESS-PATH-WILDCARD":
            ppw.append(wildcard_to_regex(v))
        elif p == "DST-PORT":
            # 兼容横杠，统一转为冒号供 sing-box 使用
            dst_ports.append(v.replace('-', ':'))
        elif p == "SRC-PORT":
            src_ports.append(v.replace('-', ':'))

        # GEOIP / SRC-IP / URL-REGEX / USER-AGENT：sing-box 规则集不支持，忽略

    # 构建 sing-box rules 数组（性能优先顺序）
    sb_rules = []

    if d:
        sb_rules.append({"domain": sorted(set(d))})
    if ds:
        sb_rules.append({"domain_suffix": sorted(set(ds))})
    if dk:
        sb_rules.append({"domain_keyword": sorted(set(dk))})
    if dr:
        sb_rules.append({"domain_regex": sorted(set(dr))})
    if pn:
        sb_rules.append({"process_name": sorted(set(pn))})
    if pp:
        sb_rules.append({"process_path": sorted(set(pp))})
    if ppw:
        sb_rules.append({"process_path_regex": sorted(set(ppw))})

    # 端口：区分普通端口和范围端口
    if dst_ports:
        ports_plain  = [v for v in set(dst_ports) if re.fullmatch(r"\d+", v)]
        ports_range  = [v for v in set(dst_ports) if not re.fullmatch(r"\d+", v)]
        if ports_plain:
            sb_rules.append({"port": [int(p) for p in sorted(ports_plain, key=int)]})
        if ports_range:
            sb_rules.append({"port_range": sorted(ports_range)})
    if src_ports:
        ports_plain  = [v for v in set(src_ports) if re.fullmatch(r"\d+", v)]
        ports_range  = [v for v in set(src_ports) if not re.fullmatch(r"\d+", v)]
        if ports_plain:
            sb_rules.append({"source_port": [int(p) for p in sorted(ports_plain, key=int)]})
        if ports_range:
            sb_rules.append({"source_port_range": sorted(ports_range)})

    if ip_all:
        ipv4 = sorted(set(x for x in ip_all if ":" not in x),
                      key=lambda x: [int(p) for p in x.split("/")[0].split(".")])
        ipv6 = sorted(set(x for x in ip_all if ":" in x))
        sb_rules.append({"ip_cidr": ipv4 + ipv6})

    os.makedirs("sing-box/rules", exist_ok=True)
    json_path = f"sing-box/rules/{filename}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"version": 2, "rules": sb_rules}, f, indent=2, ensure_ascii=False)

    subprocess.run(
        ["sing-box", "rule-set", "compile", json_path,
         "-o", f"sing-box/rules/{filename}.srs"],
        check=True,
    )


if __name__ == "__main__":
    main()
