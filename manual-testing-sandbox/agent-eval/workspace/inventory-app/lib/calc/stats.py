def average_price(prices):
    total = 0
    for price in prices:
        total += price
    return total / len(prices)


def price_spread(prices):
    lowest = min(prices)
    highest = max(prices)
    return (highest - lowest) / lowest
