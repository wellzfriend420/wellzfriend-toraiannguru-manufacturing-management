"""2026-09-30棚卸Excelを在庫品目マスタと開始在庫へ移行する。

既定は読み取りだけ。実登録には --apply が必要。
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

import openpyxl

AS_OF = "2026-09-30"
ALIASES = {
    "40g×20袋用ダンボール": "和美蓮根40g（20袋入）ダンボール",
    "40g×10袋用ダンボール": "和美蓮根40g（10袋入）ダンボール",
    "和美蓮根ダンボール": "和美蓮根　ダンボール",
    "サンフレ箱": "和美蓮根チップ箱　豊国サンフレ",
    "豊国箱": "和美蓮根チップ箱　豊国赤",
    "新袋 大": "和美蓮根チップ袋（大）",
    "新袋 小": "和美蓮根チップ袋（小）",
    "40g袋": "蓮根チップ40g 透明袋",
    "15g袋": "蓮根チップ15g 袋",
    "11g袋": "蓮根チップ11g 透明袋",
    "三方袋40g": "和美蓮根チップ　3方袋",
    "和美蓮根箱": "和美蓮根チップ箱（2袋用）",
    "女学院箱": "和美蓮根チップ箱（2袋用）女学院",
    "キーピット150": "蓮根チップ40g 脱酸素",
    "キーピット50": "蓮根チップ11g 脱酸素",
    "クレイドライ": "蓮根チップ　乾燥剤",
    "500g脱酸素剤（青）": "蓮根チップ500g 脱酸素",
}
FOUR_LABELS = [
    "和美蓮根チップシール（田中食品監修）鰹みりん",
    "和美蓮根チップシール（田中食品監修）旅行の友",
    "和美蓮根チップシール（田中食品監修）磯海苔",
    "和美蓮根チップシール（田中食品監修）のりたまご",
]


def api(base, path, method="GET", body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base.rstrip('/')}/api/v1{path}", data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))["data"]
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        raise RuntimeError(f"{method} {path}: HTTP {error.code} {detail}") from error


def source_rows(path):
    sheet = openpyxl.load_workbook(path, data_only=False, read_only=True)["在庫単価一覧"]
    result = []
    for row in sheet.iter_rows(min_row=3, values_only=True):
        name, display, quantity, unit, unit_cost = row[:5]
        if not name or quantity is None or str(name).startswith("※"):
            continue
        if name == "田中食品4種シール":
            for label in FOUR_LABELS:
                result.append({"source_name": name, "name": label, "display": "各1,000枚", "quantity": 1000, "unit": "枚", "unit_cost": unit_cost})
            continue
        result.append({"source_name": name, "name": ALIASES.get(name, name), "display": display, "quantity": quantity, "unit": unit, "unit_cost": unit_cost})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    records = source_rows(args.workbook)
    masters = api(args.base_url, "/masters")
    inventory = api(args.base_url, "/inventory")["items"]
    items_by_name = {item["name"]: item for item in masters["items"]}
    created = replaced = skipped = 0
    plan = []
    for record in records:
        item = items_by_name.get(record["name"])
        lots = [] if not item else [lot for lot in inventory if lot["item_id"] == item["id"]]
        plan.append({**record, "existing_item": bool(item), "existing_lots": len(lots)})
        if not args.apply:
            continue
        if not item:
            item = api(args.base_url, "/masters/items", "POST", {
                "name": record["name"], "item_type": "packaging", "department_id": 1,
                "storage_unit": "piece",
            })
            item = {"id": item["id"], "name": record["name"]}
            items_by_name[record["name"]] = item
            created += 1
        for lot in lots:
            if not lot.get("can_delete"):
                raise RuntimeError(f"{record['name']}: 使用履歴のある在庫ロット {lot['lot_no']} があるため中止")
            api(args.base_url, f"/inventory/lots/{lot['lot_id']}", "DELETE", {"reason": "2026-09-30棚卸Excelへの置換"})
            replaced += 1
        memo = f"2026-09-30棚卸移行／原表記: {record['display']}／換算単位: {record['unit']}"
        if record["unit_cost"] is None:
            memo += "／単価確認待ち"
        saved = api(args.base_url, "/inventory/opening-balances", "POST", {
            "item_id": item["id"], "quantity": record["quantity"],
            "unit_cost": record["unit_cost"], "registered_at": AS_OF, "memo": memo,
        })
        if saved.get("registered_at") != AS_OF:
            api(args.base_url, f"/inventory/lots/{saved['lot_id']}", "DELETE", {"reason": "棚卸基準日APIのデプロイ待ちによる取消"})
            raise RuntimeError("公開APIが棚卸基準日に未対応です。デプロイ完了後に再実行してください")
    if not args.apply:
        print(json.dumps({"mode": "dry-run", "records": len(records), "new_masters": sum(not x["existing_item"] for x in plan), "existing_masters": sum(x["existing_item"] for x in plan), "price_pending": sum(x["unit_cost"] is None for x in plan), "plan": plan}, ensure_ascii=False, indent=2))
        return
    final_inventory = api(args.base_url, "/inventory")["items"]
    check = []
    for record in records:
        item = items_by_name[record["name"]]
        lots = [lot for lot in final_inventory if lot["item_id"] == item["id"] and lot["received_or_made_on"] == AS_OF]
        quantity = sum(float(lot["quantity"]) for lot in lots)
        expected_cost = 0 if record["unit_cost"] is None else float(record["unit_cost"])
        actual_costs = {float(lot["unit_cost"]) for lot in lots}
        if quantity != float(record["quantity"]) or actual_costs != {expected_cost}:
            check.append({"name": record["name"], "expected_quantity": record["quantity"], "actual_quantity": quantity, "expected_unit_cost": expected_cost, "actual_unit_costs": sorted(actual_costs)})
    if check:
        raise RuntimeError(f"登録後照合不一致: {json.dumps(check, ensure_ascii=False)}")
    print(json.dumps({"mode": "applied", "records": len(records), "created_masters": created, "replaced_lots": replaced, "verified": len(records), "price_pending": sum(x["unit_cost"] is None for x in records)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
