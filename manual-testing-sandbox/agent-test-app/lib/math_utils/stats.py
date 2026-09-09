def calculate_mean(values):
    if len(values) == 0:
        return None
    return sum(values) / len(values)

def get_max_value(values):
    if not values:
        return None
    return max(values)

def calculate_std_dev(values):
    if len(values) == 0:
        return None
    mean = calculate_mean(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    return variance ** 0.5