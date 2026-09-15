def average_price(prices):
    if not prices:
        return None
    total = 0
    for price in prices:
        total += price
    return total / len(prices)


def price_spread(prices):
    if not prices:
        return None
    lowest = min(prices)
    highest = max(prices)
    return (highest - lowest) / lowest
