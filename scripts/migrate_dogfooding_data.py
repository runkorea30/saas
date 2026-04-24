"""
MochiCraft OPS dogfooding 데이터 이관 스크립트

소스: public.v2_*  (runkorea30's Project / Angelus Korea 운영 DB)
타겟: mochicraft_demo.*  (dashboard-v2 / dogfooding 스키마)

원칙:
  - 소스 DB는 READ-ONLY 세션. 절대 쓰기 없음.
  - 모든 INSERT 는 ON CONFLICT (id) DO NOTHING → 재실행 안전 (멱등성).
  - DELETE / TRUNCATE / DROP 금지. grep 으로 확인 가능.
  - company_id 는 환경변수의 고정 UUID 로 강제 주입 (멀티테넌트).
  - customers 는 이미 58/58 완료 → skip. 최종 COUNT 검증에는 포함.
  - orders / order_items 는 2026-01-01 이후만 이관.

실행:
  python scripts/migrate_dogfooding_data.py --dry-run   # 건수만 확인
  python scripts/migrate_dogfooding_data.py             # 사용자 승인 후 실제 이관

CLAUDE_CODE_HANDOFF.md §4, §5, §6 참조.
"""

import argparse
import os
import sys

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv


# Windows cp949 콘솔이 이모지 (✅ ⏳ ⚠️) 를 출력 못 하는 문제 회피.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()

try:
    SRC = os.environ["SOURCE_DB_URL"]
    TGT = os.environ["TARGET_DB_URL"]
    CID = os.environ["COMPANY_ID"]
except KeyError as e:
    print(f"[ERROR] 환경변수 누락: {e}. .env 파일 확인.")
    sys.exit(1)


EXPECTED = {
    "customers": 58,
    "products": 925,
    "inventory_lots": 925,
    "orders": 158,
    "order_items": 1768,
}

BATCH_SIZE = 500


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------

def current_counts(cur):
    """타겟 mochicraft_demo 5개 테이블의 현재 COUNT dict 반환."""
    cur.execute(
        """
        SELECT 'customers'      AS t, COUNT(*) FROM mochicraft_demo.customers
        UNION ALL SELECT 'products',       COUNT(*) FROM mochicraft_demo.products
        UNION ALL SELECT 'inventory_lots', COUNT(*) FROM mochicraft_demo.inventory_lots
        UNION ALL SELECT 'orders',         COUNT(*) FROM mochicraft_demo.orders
        UNION ALL SELECT 'order_items',    COUNT(*) FROM mochicraft_demo.order_items
        ORDER BY 1
        """
    )
    return dict(cur.fetchall())


def preflight_source_columns(src_cur):
    """소스 v2_order_items 실제 컬럼명 확인 (handoff §8 예상 실패 지점 대비)."""
    src_cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'v2_order_items'
        ORDER BY ordinal_position
        """
    )
    cols = [r[0] for r in src_cur.fetchall()]
    # created_at 은 소스에 없음 → 부모 orders.order_date 를 대신 사용 (migrate_order_items 참조).
    # amount, is_return 는 타겟 NOT NULL → 소스에서 그대로 가져옴.
    required = {"id", "order_id", "product_id", "quantity", "unit_price", "amount", "is_return"}
    missing = required - set(cols)
    if missing:
        print(f"[ERROR] v2_order_items 필수 컬럼 누락: {missing}")
        print(f"        실제 컬럼: {cols}")
        sys.exit(1)
    print(f"[preflight] v2_order_items 컬럼 OK: {sorted(required)}")


# ---------------------------------------------------------------------------
# 테이블별 이관 함수
# ---------------------------------------------------------------------------

def migrate_products(src_cur, tgt_cur, dry_run):
    """
    §4.1 — 기존 500/925. UPSERT (ON CONFLICT DO NOTHING) 로 신규 425건만 추가.
    category NULL → ''. updated_at ← created_at.
    """
    src_cur.execute(
        """
        SELECT id, code, name, category, sell_price, supply_price,
               unit_price_usd, unit, is_active, created_at
        FROM public.v2_products
        """
    )
    rows = [
        (
            r[0],           # id
            CID,            # company_id (강제 주입)
            r[1],           # code
            r[2],           # name
            r[3] or '',     # category (NULL → '')
            r[4],           # sell_price
            r[5],           # supply_price
            r[6],           # unit_price_usd
            r[7],           # unit
            r[8],           # is_active
            r[9],           # created_at
            r[9],           # updated_at ← created_at
        )
        for r in src_cur.fetchall()
    ]
    print(f"[products] 소스 {len(rows)} 건 읽음")
    if dry_run:
        return

    execute_values(
        tgt_cur,
        """
        INSERT INTO mochicraft_demo.products
          (id, company_id, code, name, category, sell_price, supply_price,
           unit_price_usd, unit, is_active, created_at, updated_at)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
        """,
        rows,
        page_size=BATCH_SIZE,
    )
    print(f"[products] INSERT 완료 (기존은 skip)")


def migrate_inventory_lots(src_cur, tgt_cur, dry_run):
    """
    §4.2 — 925 전체. 'initial' → 'opening'. date → timestamptz (단순 캐스팅).
    """
    src_cur.execute(
        """
        SELECT id, product_id, lot_type, quantity, remaining_quantity,
               cost_usd, cost_krw, lot_date::timestamptz AS lot_date, created_at
        FROM public.v2_inventory_lots
        WHERE product_id IS NOT NULL
        """
    )
    rows = [
        (
            r[0],                                           # id
            CID,                                            # company_id
            r[1],                                           # product_id
            'opening' if r[2] == 'initial' else r[2],       # lot_type 변환
            r[3],                                           # quantity
            r[4],                                           # remaining_quantity
            r[5],                                           # cost_usd
            r[6],                                           # cost_krw
            r[7],                                           # lot_date (timestamptz)
            r[8],                                           # created_at
        )
        for r in src_cur.fetchall()
    ]
    print(f"[inventory_lots] 소스 {len(rows)} 건 읽음")
    if dry_run:
        return

    execute_values(
        tgt_cur,
        """
        INSERT INTO mochicraft_demo.inventory_lots
          (id, company_id, product_id, lot_type, quantity, remaining_quantity,
           cost_usd, cost_krw, lot_date, created_at)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
        """,
        rows,
        page_size=BATCH_SIZE,
    )
    print(f"[inventory_lots] INSERT 완료 (기존은 skip)")


def migrate_orders(src_cur, tgt_cur, dry_run):
    """
    §4.3 — 2026-01-01 이후, customer_id 있는 것만. source 'manual' 주입.
    total_amount 는 타겟 NOT NULL → v2_order_items 의 SUM(amount) 로 계산 (items 합과 자동 일치).
    """
    src_cur.execute(
        """
        SELECT o.id, o.customer_id,
               o.order_date::timestamptz AS order_date,
               o.status,
               COALESCE((
                 SELECT SUM(oi.amount)
                 FROM public.v2_order_items oi
                 WHERE oi.order_id = o.id
               ), 0)::integer AS total_amount
        FROM public.v2_orders o
        WHERE o.order_date >= '2026-01-01'
          AND o.customer_id IS NOT NULL
        """
    )
    rows = [
        (
            r[0],       # id
            CID,        # company_id
            r[1],       # customer_id
            r[2],       # order_date
            r[3],       # status
            'manual',   # source (NOT NULL 타겟 대응)
            r[4],       # total_amount (items 합)
        )
        for r in src_cur.fetchall()
    ]
    print(f"[orders] 소스 {len(rows)} 건 읽음 (2026년만)")
    if dry_run:
        return

    execute_values(
        tgt_cur,
        """
        INSERT INTO mochicraft_demo.orders
          (id, company_id, customer_id, order_date, status, source, total_amount)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
        """,
        rows,
        page_size=BATCH_SIZE,
    )
    print(f"[orders] INSERT 완료 (기존은 skip)")


def migrate_order_items(src_cur, tgt_cur, dry_run):
    """
    §4.4 — 2026년 orders 에 속한 item 만. order_id/product_id FK 자동 검증.
    소스 v2_order_items 에는 created_at 이 없음 → 부모 orders.order_date 로 대체 (비즈니스 타임스탬프 보존).
    amount, is_return 는 타겟 NOT NULL → 소스 값 그대로 보존.
    """
    src_cur.execute(
        """
        SELECT oi.id, oi.order_id, oi.product_id,
               oi.quantity, oi.unit_price, oi.amount, oi.is_return,
               o.order_date::timestamptz AS created_at
        FROM public.v2_order_items oi
        INNER JOIN public.v2_orders o ON oi.order_id = o.id
        WHERE o.order_date >= '2026-01-01'
          AND o.customer_id IS NOT NULL
          AND oi.product_id IS NOT NULL
        """
    )
    rows = [
        (
            r[0],   # id
            CID,    # company_id
            r[1],   # order_id
            r[2],   # product_id
            r[3],   # quantity
            r[4],   # unit_price
            r[5],   # amount
            r[6],   # is_return
            r[7],   # created_at ← 부모 orders.order_date
        )
        for r in src_cur.fetchall()
    ]
    print(f"[order_items] 소스 {len(rows)} 건 읽음 (2026 orders 소속만)")
    if dry_run:
        return

    execute_values(
        tgt_cur,
        """
        INSERT INTO mochicraft_demo.order_items
          (id, company_id, order_id, product_id, quantity, unit_price, amount, is_return, created_at)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
        """,
        rows,
        page_size=BATCH_SIZE,
    )
    print(f"[order_items] INSERT 완료 (기존은 skip)")


# ---------------------------------------------------------------------------
# 무결성 검증 (이관 후 §6)
# ---------------------------------------------------------------------------

def verify_integrity(tgt_cur):
    """§6 추가 무결성 체크: 월별 분포, orphan_items, lot_type 변환."""
    print("\n=== 무결성 검증 ===")

    tgt_cur.execute(
        """
        SELECT to_char(order_date, 'YYYY-MM') AS month, COUNT(*)
        FROM mochicraft_demo.orders
        GROUP BY 1 ORDER BY 1
        """
    )
    print("  orders 월별 분포 (기대: 2026-01=50, 2026-02=47, 2026-03=61)")
    for month, cnt in tgt_cur.fetchall():
        print(f"    {month}: {cnt}")

    tgt_cur.execute(
        """
        SELECT COUNT(*)
        FROM mochicraft_demo.order_items oi
        LEFT JOIN mochicraft_demo.orders   o ON oi.order_id   = o.id
        LEFT JOIN mochicraft_demo.products p ON oi.product_id = p.id
        WHERE o.id IS NULL OR p.id IS NULL
        """
    )
    orphans = tgt_cur.fetchone()[0]
    mark = "✅" if orphans == 0 else "⚠️"
    print(f"  {mark} orphan_items: {orphans} (기대 0)")

    tgt_cur.execute(
        """
        SELECT lot_type, COUNT(*)
        FROM mochicraft_demo.inventory_lots
        GROUP BY 1 ORDER BY 1
        """
    )
    print("  inventory_lots.lot_type 분포 (기대: 'initial' 0 건)")
    for lt, cnt in tgt_cur.fetchall():
        mark = "⚠️" if lt == 'initial' else "  "
        print(f"    {mark} {lt}: {cnt}")


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="MochiCraft OPS dogfooding 데이터 이관")
    parser.add_argument("--dry-run", action="store_true",
                        help="소스 건수만 확인. 타겟에 INSERT 하지 않음.")
    parser.add_argument("--skip-approval", action="store_true",
                        help="사용자 승인 프롬프트 건너뜀. 로컬 대화형 실행에선 쓰지 말 것.")
    args = parser.parse_args()

    src = psycopg2.connect(SRC)
    src.set_session(readonly=True, autocommit=True)

    tgt = psycopg2.connect(TGT)
    tgt.autocommit = False

    try:
        with src.cursor() as sc, tgt.cursor() as tc:
            print(f"{'=' * 60}")
            print(f"  MochiCraft OPS 데이터 이관  |  dry-run={args.dry_run}")
            print(f"  company_id = {CID}")
            print(f"{'=' * 60}\n")

            preflight_source_columns(sc)

            print("\n=== 실행 전 타겟 상태 ===")
            before = current_counts(tc)
            for k in sorted(EXPECTED):
                cur = before.get(k, 0)
                exp = EXPECTED[k]
                mark = "✅" if cur == exp else ("⏳" if cur < exp else "⚠️")
                print(f"  {mark} {k}: {cur} / 기대 {exp}")

            if not args.dry_run and not args.skip_approval:
                ans = input("\n실제 이관을 진행합니다. 계속하시겠습니까? [y/N]: ")
                if ans.strip().lower() != 'y':
                    print("중단.")
                    sys.exit(0)

            # 이관 순서: FK 의존성 — products → inventory_lots → orders → order_items.
            # customers 는 이미 58/58 완료이므로 skip.
            for fn, label in [
                (migrate_products,       "products"),
                (migrate_inventory_lots, "inventory_lots"),
                (migrate_orders,         "orders"),
                (migrate_order_items,    "order_items"),
            ]:
                print(f"\n--- {label} ---")
                try:
                    fn(sc, tc, args.dry_run)
                    if not args.dry_run:
                        tgt.commit()
                        print(f"[{label}] COMMIT")
                except Exception as e:
                    tgt.rollback()
                    print(f"[{label}] ERROR: {e}")
                    print(f"[{label}] ROLLBACK. 다음 테이블로 진행하려면 원인 해결 후 재실행.")
                    raise

            print("\n=== 실행 후 타겟 상태 ===")
            after = current_counts(tc)
            for k in sorted(EXPECTED):
                cur = after.get(k, 0)
                exp = EXPECTED[k]
                mark = "✅" if cur == exp else "⚠️"
                print(f"  {mark} {k}: {cur} / 기대 {exp}")

            if not args.dry_run:
                verify_integrity(tc)

    finally:
        src.close()
        tgt.close()


if __name__ == "__main__":
    main()
