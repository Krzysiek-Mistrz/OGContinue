#!/usr/bin/env bash
# Regenerates the broken workspace so every run starts identically.
#
# The files are written out here rather than copied from a pristine second
# tree on purpose. A mirrored copy is a second file with the same relative
# path, which makes every path the agent is given ambiguous - and if that
# copy is gitignored to avoid the ambiguity, workspace search stops seeing
# it entirely and the agent silently edits the wrong one.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf workspace
mkdir -p workspace/inventory-app/src/report workspace/inventory-app/lib/calc

cat > workspace/inventory-app/lib/calc/stats.py <<'PY'
def average_price(prices):
    total = 0
    for price in prices:
        total += price
    return total / len(prices)


def price_spread(prices):
    lowest = min(prices)
    highest = max(prices)
    return (highest - lowest) / lowest
PY

cat > workspace/inventory-app/src/report/format.py <<'PY'
def format_line(item_name, quantity, unit_price):
    return "Item: " + item_name + " x" + quantity + " @ " + unit_price


def format_total(label, amount):
    return label + ": " + amount
PY

cat > workspace/inventory-app/src/main.py <<'PY'
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from calc.stats import average_price, price_spread
from report.format import format_line, format_total

ITEMS = [
    ("widget", 3, 4.5),
    ("gasket", 10, 0.75),
    ("flange", 1, 22.0),
]


def main():
    for name, quantity, price in ITEMS:
        print(format_line(name, quantity, price))

    prices = [price for _, _, price in ITEMS]
    print(format_total("Average", average_price(prices)))
    print(format_total("Spread", price_spread(prices)))

    # Empty inventory is a legitimate state, not an error.
    print(format_total("Average of nothing", average_price([])))
    print(format_total("Spread of nothing", price_spread([])))


if __name__ == "__main__":
    main()
PY

echo "workspace reset - 6 defects across 2 files, main.py currently crashes"
