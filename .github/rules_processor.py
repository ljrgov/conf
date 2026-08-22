# ──说明: 用于工作流规则集格式化（sing-box、surge、mihomo） ────────────────────────────────────────────────
import gzip
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

# ── BGP 数据源配置 ────────────────────────────────────────────────
BGP_TABLE_PATH = os.environ.get("BGP_TABLE_PATH", "/tmp/bgp_table.jsonl")
BGP_MIN_LINES = 100_000
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
        with (
            urllib.request.urlopen(req, timeout=60) as resp,
            open(BGP_TABLE_PATH, "wb") as f,
        ):
            f.write(resp.read())
        with open(BGP_TABLE_PATH, "rb") as f:
            lines = sum(1 for _ in f)
        if lines > BGP_MIN_LINES:
            print(f"✓ bgp.tools 成功 ({lines:,} 行)", file=sys.stderr)
            return True
        print(f"! bgp.tools 行数不足 ({lines:,})", file=sys.stderr)
    except (urllib.error.URLError, OSError) as e:
        print(f"! bgp.tools 失败: {e}", file=sys.stderr)
    return False


# ── 备用主源：RIPE NCC RIS whois dump ────────────────────────────
def _try_ripe_ris() -> bool:
    print("尝试从 RIPE NCC RIS 下载...", file=sys.stderr)
    v4_gz = "/tmp/ris_ipv4.gz"
    v6_gz = "/tmp/ris_ipv6.gz"
    try:
        urllib.request.urlretrieve(
            "https://www.ris.ripe.net/dumps/riswhoisdump.IPv4.gz", v4_gz
        )
        urllib.request.urlretrieve(
            "https://www.ris.ripe.net/dumps/riswhoisdump.IPv6.gz", v6_gz
        )

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
                        cidr = None
                        asn_val = None
                        for p in parts:
                            p_clean = p.upper().replace("AS", "").split(",")[0]
                            if "/" in p:
                                cidr = p
                            elif p_clean.isdigit():
                                asn_val = int(p_clean)
                        if cidr and asn_val is not None:
                            out_f.write(
                                json.dumps({"CIDR": cidr, "ASN": asn_val}) + "\n"
                            )
                            count += 1

        if count > BGP_MIN_LINES:
            print(f"✓ RIPE NCC RIS 成功 ({count:,} 条)", file=sys.stderr)
            return True
        print(f"! RIPE NCC RIS 条目不足 ({count:,})", file=sys.stderr)
    except (urllib.error.URLError, OSError, gzip.BadGzipFile) as e:
        print(f"! RIPE NCC RIS 失败: {e}", file=sys.stderr)
    return False


def ensure_bgp_table() -> None:
    if os.path.exists(BGP_TABLE_PATH):
        try:
            with open(BGP_TABLE_PATH, "rb") as f:
                if sum(1 for _ in f) > BGP_MIN_LINES:
                    return
        except (FileNotFoundError, OSError):
            pass

    print(f"BGP 表缺失或过小，开始初始化 → {BGP_TABLE_PATH}", file=sys.stderr)

    if _try_bgptools():
        return
    if _try_ripe_ris():
        return

    print(
        "WARNING: 离线 BGP 表初始化失败，将完全依赖 RIPE stat API 在线补查",
        file=sys.stderr,
    )
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
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            wait = 2**attempt
            print(
                f"  RIPE stat AS{asn} 第{attempt + 1}次失败: {e}，{wait}s 后重试",
                file=sys.stderr,
            )
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
    escaped = re.escape(pattern)
    return "^" + escaped.replace(r"\*", ".*").replace(r"\?", ".") + "$"


# ── 规则规范化 ────────────────────────────────────────────────────
# 已知前缀的完整列表（用于判断是否是结构化前缀行）
# [FIX] 原来这里两个相邻字符串字面量之间少了一个 "|"：
#   r"...DOMAIN-WILDCARD|DOMAIN-REGEX"
#   r"IP-CIDR?|IP-CIDR6|..."
# Python 会把它们拼接成字面量 "DOMAIN-REGEXIP-CID(R)?"，导致
# "DOMAIN-REGEX," 永远无法匹配这个前缀表。同时把 "IP-CIDR?|IP-CIDR6"
# 修正为 "IP-CIDR6?"，避免同样的拼接方式产生冗余分支。
_RE_KNOWN_PREFIX = re.compile(
    r"^(DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|DOMAIN-WILDCARD|DOMAIN-REGEX|"
    r"IP-CIDR6?|IP-ASN|GEOIP|SRC-IP|IP-SUFFIX|"
    r"DST-PORT|DEST-PORT|SRC-PORT|"
    r"PROCESS(?:-NAME(?:-WILDCARD)?|-PATH(?:-WILDCARD|-REGEX)?)?|PN|"
    r"PROCESS-NAME-REGEX|PATH(?:-WILDCARD)?|"
    r"URL-REGEX|USER-AGENT|"
    r"PACKAGE-NAME(?:-REGEX)?|PKG-NAME|"
    r"AND|OR|NOT|GEOSITE),",
    re.IGNORECASE,
)

# 端口范围匹配
_RE_PORT_RANGE = re.compile(r"^\d+[-:]\d+$")

# 含 PORT 的前缀
_RE_PORT_PREFIX = re.compile(r"^(DST-PORT|SRC-PORT),", re.IGNORECASE)

# IP-ASN 前缀（含各种别名）
_RE_ASN_PREFIX = re.compile(r"^IP-ASN,", re.IGNORECASE)

# 进程相关前缀
_RE_PROCESS_PREFIX = re.compile(r"^(PROCESS(?:-NAME)?|PN|pkg),", re.IGNORECASE)

# PATH 前缀（识别为 PROCESS-PATH）
_RE_PATH_PREFIX = re.compile(r"^(PATH(?:-WILDCARD)?),", re.IGNORECASE)

# 裸 AS 数字：必须有 AS 前缀，避免与端口混淆
_RE_BARE_ASN = re.compile(r"^AS(\d+)$", re.IGNORECASE)

_RE_IPV4 = re.compile(r"^(\d{1,3}\.){3}\d{1,3}(/\d+)?$")
# 匹配标准 IPv6（含压缩格式 ::1、::、2001:db8::/32 等）
_RE_IPV6 = re.compile(r"^[0-9a-fA-F]*(?::[0-9a-fA-F]*){2,}(/\d+)?$")

# [NEW] 支持 "key: value" 风格（例如从 sing-box JSON 规则集里摘出来的
# `domain_regex: "^r+...$"`），把 sing-box 的字段名映射到内部标准前缀。
_KV_KEY_MAP = {
    "domain": "DOMAIN",
    "domain_suffix": "DOMAIN-SUFFIX",
    "domain_keyword": "DOMAIN-KEYWORD",
    "domain_wildcard": "DOMAIN-WILDCARD",
    "domain_regex": "DOMAIN-REGEX",
    "ip_cidr": "IP-CIDR",
    "ip_cidr6": "IP-CIDR6",
    "ip_asn": "IP-ASN",
    "geoip": "GEOIP",
    "src_ip": "SRC-IP",
    "dst_port": "DST-PORT",
    "src_port": "SRC-PORT",
    "process_name": "PROCESS-NAME",
    "process_path": "PROCESS-PATH",
    "process_path_regex": "PROCESS-PATH-WILDCARD",
    "package_name": "PACKAGE-NAME",
    "package_name_regex": "PACKAGE-NAME-REGEX",
    "url_regex": "URL-REGEX",
    "user_agent": "USER-AGENT",
}
_RE_KV_FORMAT = re.compile(
    r"^(" + "|".join(_KV_KEY_MAP.keys()) + r")\s*:\s*(.+)$", re.IGNORECASE
)


def normalize(src_path: str) -> list[str]:
    """
    将源文件中各种格式的规则统一规范化为内部标准格式。

    内部标准格式说明：
    - 目标 IP 类（IP-CIDR/IP-CIDR6/IP-ASN/GEOIP）：带 ,no-resolve 后缀
      （no-resolve 仅对"目标IP"类规则有意义，SRC-IP 和端口类规则不涉及
      DNS 解析，因此不带该参数，sing-box 输出时统一忽略该参数）
    - SRC-IP / PORT 类：不带 no-resolve
    - 域名/进程类：不带 no-resolve
    - 端口范围统一使用 "-" 分隔（mihomo 原生语法），sing-box 输出时转换为 ":"，
      Surge 端口前缀统一为 DST-PORT，输出阶段再改写为 Surge 官方使用的 DEST-PORT
    - OR/AND/NOT 规则：原样保留，各平台在输出阶段自行改写子规则前缀与 no-resolve
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

            # ⓪ [NEW] "key: value" 格式（如 domain_regex: "^r+...$"）
            # 转换成内部标准的 "PREFIX,value" 格式，然后继续走后面已有的
            # 处理流程（包括自动补 no-resolve）。
            m = _RE_KV_FORMAT.match(line)
            if m:
                key = m.group(1).lower()
                value = m.group(2).strip()
                # 去除包裹的单/双引号
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]
                # 还原从 JSON 里直接复制出来的转义反斜杠：\\  ->  \
                value = value.replace("\\\\", "\\")
                line = f"{_KV_KEY_MAP[key]},{value}"

            upper = line.upper()

            # ① 逻辑规则：原样保留
            if upper.startswith(("OR,", "AND,", "NOT,")):
                out.append(line)
                continue

            # ② PROCESS-NAME / PN 前缀
            m = _RE_PROCESS_PREFIX.match(line)
            if m:
                value = line[len(m.group(0)) :].strip()
                out.append(f"PROCESS-NAME,{value}")
                continue

            # ③ PATH / PATH-WILDCARD 前缀 → PROCESS-PATH / PROCESS-PATH-WILDCARD
            m = _RE_PATH_PREFIX.match(line)
            if m:
                prefix_src = m.group(1).upper()
                value = line[len(m.group(0)) :].strip()
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

            # ⑤ 纯数字或端口范围 -> 端口（mihomo 端口范围语法使用 "-"，sing-box
            # 输出阶段会再转换为 ":"；no-resolve 不适用于端口类规则，故不添加）
            if re.fullmatch(r"\d+", line) or _RE_PORT_RANGE.match(line):
                val = line.replace(":", "-")
                out.append(f"DST-PORT,{val}")
                continue

            # ⑥ 已知结构化前缀
            if _RE_KNOWN_PREFIX.match(line):
                p, v = line.split(",", 1)
                p = p.upper().replace("_", "-")

                # 规范化别名
                if p in ("PN", "PROCESS-NAME"):
                    p = "PROCESS-NAME"
                elif p in ("PACKAGE-NAME", "PKG-NAME"):
                    p = "PACKAGE-NAME"
                elif p.endswith("KEYWORD"):
                    p = "DOMAIN-KEYWORD"
                elif p == "IP-SUFFIX":  # 修正 IP-SUFFIX 为 CIDR
                    p = "IP-CIDR"
                elif p == "DEST-PORT":  # 统一端口前缀，输出阶段再按平台改写
                    p = "DST-PORT"
                elif p == "PATH":
                    p = (
                        "PROCESS-PATH-WILDCARD"
                        if ("*" in v or "?" in v)
                        else "PROCESS-PATH"
                    )
                elif p == "PATH-WILDCARD":
                    p = "PROCESS-PATH-WILDCARD"

                # 需要 no-resolve 的类型：仅目标 IP 类规则
                # （mihomo 官方文档："no-resolve 仅支持关于目标IP的规则"；
                #   Surge 官方文档："IP type rules have a proprietary parameter no-resolve"，
                #   IP 类型仅指 IP-CIDR / IP-CIDR6 / GEOIP / IP-ASN）
                # SRC-IP（来源IP）和端口类规则不触发 DNS 解析，no-resolve 对它们无意义，
                # 之前版本会误加，属于不符合官方文档的 bug。
                if p in ("IP-CIDR", "IP-CIDR6", "IP-ASN", "GEOIP", "IP-SUFFIX"):
                    val_clean = re.sub(r",\s*no-resolve", "", v, flags=re.IGNORECASE)
                    out.append(f"{p},{val_clean},no-resolve")
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
                pfx = (
                    "PROCESS-PATH-WILDCARD"
                    if ("*" in line or "?" in line)
                    else "PROCESS-PATH"
                )
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
                out.append(f"DOMAIN,{line}")

    return out


# ── 排序权重 ──────────────────────────────────────────────────────
_SORT_ORDER = {
    "DOMAIN": 0,
    "DOMAIN-SUFFIX": 1,
    "DOMAIN-KEYWORD": 2,
    "DOMAIN-WILDCARD": 3,
    "PROCESS-NAME": 4,
    "PROCESS-NAME-WILDCARD": 4.5,
    "PROCESS-PATH": 5,
    "PROCESS-PATH-WILDCARD": 6,
    "IP-CIDR": 7,
    "IP-CIDR6": 8,
    "IP-SUFFIX": 8.5,
    "IP-ASN": 9,
    "PACKAGE-NAME": 9.5,
    "URL-REGEX": 10,
    "USER-AGENT": 11,
    "DOMAIN-REGEX": 11.5,
    "PROCESS-NAME-REGEX": 11.6,
    "PROCESS-PATH-REGEX": 11.7,
    "PACKAGE-NAME-REGEX": 11.8,
    "SRC-IP": 13,
    "DST-PORT": 14,
    "SRC-PORT": 15,
    "OR": 16,
    "AND": 17,
    "NOT": 18,
    "GEOSITE": 19,
    "GEOIP": 20,
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
    filename = os.path.splitext(os.path.basename(input_path))[0]
    std_rules = normalize(input_path)

    # ── Surge ────────────────────────────────────────────────────
    # 官方文档 (manual.nssurge.com)：
    # - IP-based Rule 支持 IP-CIDR / IP-CIDR6 / GEOIP / IP-ASN，四者共享 no-resolve
    # - SRC-IP 为独立规则类型（仅 Mac 版本，支持 CIDR）
    # - 端口规则的官方字段名是 DEST-PORT（不是 DST-PORT）
    SURGE_ALLOWED_PREFIXES = {
        "DOMAIN",
        "DOMAIN-SUFFIX",
        "DOMAIN-KEYWORD",
        "DOMAIN-WILDCARD",
        "IP-CIDR",
        "IP-CIDR6",
        "IP-ASN",
        "GEOIP",
        "SRC-IP",
        "DST-PORT",
        "SRC-PORT",
        "PROCESS-NAME",
        "PROCESS-PATH",
        "PROCESS-PATH-WILDCARD",
        "URL-REGEX",
        "USER-AGENT",
        "AND",
        "OR",
        "NOT",
    }

    surge_res = []
    for rule in std_rules:
        prefix = rule.split(",", 1)[0].upper()
        if prefix not in SURGE_ALLOWED_PREFIXES:
            continue

        if prefix in ("PROCESS-PATH", "PROCESS-PATH-WILDCARD"):
            value = rule.split(",", 1)[1]
            surge_res.append(f"PROCESS-NAME,{value}")

        elif prefix == "DST-PORT":
            value = rule.split(",", 1)[1]
            surge_res.append(f"DEST-PORT,{value}")

        elif prefix in ("OR", "AND", "NOT"):
            # 只有目标 IP 类规则才恢复 no-resolve；端口前缀顺带改写为 DEST-PORT
            restored = re.sub(
                r"(IP-CIDR6?|IP-ASN|GEOIP),([^,)]+)",
                r"\1,\2,no-resolve",
                rule,
                flags=re.IGNORECASE,
            )
            restored = re.sub(
                r"\bDST-PORT\b", "DEST-PORT", restored, flags=re.IGNORECASE
            )
            surge_res.append(restored)
        else:
            surge_res.append(rule)

    surge_res = sort_rules(surge_res)
    os.makedirs("surge/rules", exist_ok=True)
    with open(f"surge/rules/{filename}.list", "w", encoding="utf-8") as f:
        f.write("\n".join(surge_res) + "\n")

    # ── Mihomo ───────────────────────────────────────────────────
    # 官方文档 (wiki.metacubex.one)：
    # - mihomo 没有 USER-AGENT 规则类型
    # - mihomo 没有 PACKAGE-NAME / PACKAGE-NAME-REGEX 规则类型；
    #   Android 包名原生就通过 PROCESS-NAME 匹配，正则形式通过 PROCESS-NAME-REGEX 匹配，
    #   所以这两类不能直接丢弃或原样透传，要分别改写成 PROCESS-NAME / PROCESS-NAME-REGEX
    # - 来源 IP CIDR 匹配的官方字段名是 SRC-IP-CIDR（不是 SRC-IP）
    # - no-resolve 仅支持关于目标IP的规则（IP-CIDR/IP-CIDR6/IP-SUFFIX/IP-ASN/GEOIP）
    MIHOMO_UNSUPPORTED = {"USER-AGENT"}
    mihomo_res = []
    for rule in std_rules:
        parts = rule.split(",", 1)
        if len(parts) < 2:
            continue

        prefix = parts[0].upper()

        if prefix in MIHOMO_UNSUPPORTED:
            continue

        if prefix in ("OR", "AND", "NOT"):
            fixed_rule = re.sub(
                r"(IP-CIDR6?|IP-ASN|GEOIP),([^,)]+)",
                r"\1,\2,no-resolve",
                rule,
                flags=re.IGNORECASE,
            )
            fixed_rule = re.sub(
                r"\bSRC-IP\b", "SRC-IP-CIDR", fixed_rule, flags=re.IGNORECASE
            )
            # 嵌套条件里同样可能出现 PACKAGE-NAME(-REGEX)，需先转 REGEX 变体，
            # 避免 \bPACKAGE-NAME\b 提前把 "PACKAGE-NAME-REGEX" 中的前半段吃掉
            fixed_rule = re.sub(
                r"\bPACKAGE-NAME-REGEX\b",
                "PROCESS-NAME-REGEX",
                fixed_rule,
                flags=re.IGNORECASE,
            )
            fixed_rule = re.sub(
                r"\bPACKAGE-NAME\b", "PROCESS-NAME", fixed_rule, flags=re.IGNORECASE
            )
            mihomo_res.append(fixed_rule)
        elif prefix == "SRC-IP":
            mihomo_res.append(f"SRC-IP-CIDR,{parts[1]}")
        elif prefix == "PACKAGE-NAME-REGEX":
            mihomo_res.append(f"PROCESS-NAME-REGEX,{parts[1]}")
        elif prefix == "PACKAGE-NAME":
            mihomo_res.append(f"PROCESS-NAME,{parts[1]}")
        else:
            mihomo_res.append(rule)

    mihomo_res = sort_rules(mihomo_res)
    os.makedirs("mihomo/rules", exist_ok=True)
    with open(f"mihomo/rules/{filename}.list", "w", encoding="utf-8") as f:
        f.write("\n".join(mihomo_res) + "\n")

    # ── Sing-box ─────────────────────────────────────────────────
    d, ds, dk, dr = [], [], [], []
    ip_all, src_ip_all = [], []
    pn, pp, ppw = [], [], []
    pkgs, pkgs_regex = [], []
    logicals = []
    dst_ports, src_ports = [], []

    for rule in std_rules:
        upper = rule.upper()

        if upper.startswith(("OR,", "AND,", "NOT,")):
            if upper.startswith("AND,"):
                mode = "and"
            elif upper.startswith("OR,"):
                mode = "or"
            else:
                mode = "not"
            content = rule[len(mode) + 1 :]
            items = re.findall(r"\(([^()]+)\)", content)

            nested_rules = []
            for item in items:
                parts = item.split(",")
                if len(parts) < 2:
                    continue
                it_p, it_v = parts[0].upper(), parts[1]

                if it_p in ("PROCESS-NAME", "PACKAGE-NAME", "PN", "PKG-NAME"):
                    nested_rules.append({"process_name": [it_v]})
                    nested_rules.append({"package_name": [it_v]})
                elif it_p == "IP-ASN":
                    asns_cidrs = asn_to_cidrs(int(it_v))
                    if asns_cidrs:
                        nested_rules.append({"ip_cidr": asns_cidrs})
                elif it_p in ("IP-CIDR", "IP-CIDR6"):
                    nested_rules.append({"ip_cidr": [it_v]})
                elif it_p == "SRC-IP":
                    nested_rules.append({"source_ip_cidr": [it_v]})
                elif it_p == "DOMAIN-WILDCARD":
                    nested_rules.append({"domain_regex": [wildcard_to_regex(it_v)]})
                elif it_p == "DOMAIN-REGEX":
                    nested_rules.append({"domain_regex": [it_v]})
                elif it_p == "PROCESS-PATH":
                    nested_rules.append({"process_path": [it_v]})
                elif it_p == "PROCESS-PATH-WILDCARD":
                    nested_rules.append(
                        {"process_path_regex": [wildcard_to_regex(it_v)]}
                    )
                elif it_p == "PACKAGE-NAME-REGEX":
                    nested_rules.append({"package_name_regex": [it_v]})
                elif it_p in ("DST-PORT", "SRC-PORT"):
                    # 与最外层规则一致：纯数字进 port/source_port，
                    # 含 "-" 的范围转换为 sing-box 的 ":" 语法进 port_range/source_port_range
                    is_dst = it_p == "DST-PORT"
                    field_single = "port" if is_dst else "source_port"
                    field_range = "port_range" if is_dst else "source_port_range"
                    if re.fullmatch(r"\d+", it_v):
                        nested_rules.append({field_single: [int(it_v)]})
                    else:
                        nested_rules.append({field_range: [it_v.replace("-", ":")]})
                else:
                    mapping = {
                        "DOMAIN": "domain",
                        "DOMAIN-SUFFIX": "domain_suffix",
                        "DOMAIN-KEYWORD": "domain_keyword",
                        "IP-CIDR": "ip_cidr",
                        "IP-CIDR6": "ip_cidr",
                    }
                    if it_p in mapping:
                        nested_rules.append({mapping[it_p]: [it_v]})

            if mode == "not":
                # 无头规则的 logical.mode 只有 "and"/"or"，没有 "not"；
                # 取反要用 invert 字段表达（见官方文档 invert 说明）。
                # 单个条件：直接在该规则对象上加 invert
                # 多个条件：先用 logical AND 把它们合并成一个整体，再对整体 invert
                if len(nested_rules) == 1:
                    inverted = dict(nested_rules[0])
                    inverted["invert"] = True
                    logicals.append(inverted)
                elif len(nested_rules) > 1:
                    logicals.append(
                        {
                            "type": "logical",
                            "mode": "and",
                            "rules": nested_rules,
                            "invert": True,
                        }
                    )
            elif nested_rules:
                logicals.append(
                    {"type": "logical", "mode": mode, "rules": nested_rules}
                )
            continue

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
        elif p == "DOMAIN-REGEX":
            dr.append(v)
        elif p == "PROCESS-NAME-REGEX":
            pass  # 无头规则没有 process_name_regex 字段，无法表达
        elif p == "PROCESS-NAME-WILDCARD":
            pass  # 无头规则没有对应字段，无法表达
        elif p == "PACKAGE-NAME-REGEX":
            pkgs_regex.append(v)
        elif p == "IP-CIDR" or p == "IP-CIDR6":
            ip_all.append(v)
        elif p == "IP-ASN":
            ip_all.extend(asn_to_cidrs(int(v)))
        elif p == "SRC-IP":
            src_ip_all.append(v)
        elif p == "PROCESS-NAME":
            pn.append(v)
            pkgs.append(v)
        elif p == "PACKAGE-NAME":
            pkgs.append(v)
            pn.append(v)
        elif p == "PROCESS-PATH":
            pp.append(v)
        elif p == "PROCESS-PATH-WILDCARD":
            ppw.append(wildcard_to_regex(v))
        elif p == "DST-PORT":
            dst_ports.append(v.replace("-", ":"))
        elif p == "SRC-PORT":
            src_ports.append(v.replace("-", ":"))

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
    if pkgs:
        sb_rules.append({"package_name": sorted(set(pkgs))})
    if pkgs_regex:
        sb_rules.append({"package_name_regex": sorted(set(pkgs_regex))})

    if dst_ports:
        ports_plain = [v for v in set(dst_ports) if re.fullmatch(r"\d+", v)]
        ports_range = [v for v in set(dst_ports) if not re.fullmatch(r"\d+", v)]
        if ports_plain:
            sb_rules.append({"port": [int(p) for p in sorted(ports_plain, key=int)]})
        if ports_range:
            sb_rules.append({"port_range": sorted(ports_range)})
    if src_ports:
        ports_plain = [v for v in set(src_ports) if re.fullmatch(r"\d+", v)]
        ports_range = [v for v in set(src_ports) if not re.fullmatch(r"\d+", v)]
        if ports_plain:
            sb_rules.append(
                {"source_port": [int(p) for p in sorted(ports_plain, key=int)]}
            )
        if ports_range:
            sb_rules.append({"source_port_range": sorted(ports_range)})

    if ip_all:
        ipv4 = sorted(
            {x for x in ip_all if ":" not in x},
            key=lambda x: [int(p) for p in x.split("/")[0].split(".")],
        )
        ipv6 = sorted({x for x in ip_all if ":" in x})
        sb_rules.append({"ip_cidr": ipv4 + ipv6})

    if src_ip_all:
        ipv4 = sorted(
            {x for x in src_ip_all if ":" not in x},
            key=lambda x: [int(p) for p in x.split("/")[0].split(".")],
        )
        ipv6 = sorted({x for x in src_ip_all if ":" in x})
        sb_rules.append({"source_ip_cidr": ipv4 + ipv6})

    if logicals:
        sb_rules.extend(logicals)

    os.makedirs("sing-box/rules", exist_ok=True)
    json_path = f"sing-box/rules/{filename}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"version": 4, "rules": sb_rules}, f, indent=2, ensure_ascii=False)

    subprocess.run(
        [
            "sing-box",
            "rule-set",
            "compile",
            json_path,
            "-o",
            f"sing-box/rules/{filename}.srs",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
