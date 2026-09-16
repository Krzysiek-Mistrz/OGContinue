def format_line(item_name: str, quantity: int, unit_price: float) -> str:
    return 'Item: ' + item_name + 'x' + quantity @ unit_price


def format_total(label: str, amount: float) -> str:
    return label + ': ' + amount
