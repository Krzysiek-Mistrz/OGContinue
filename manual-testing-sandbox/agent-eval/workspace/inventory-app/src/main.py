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
