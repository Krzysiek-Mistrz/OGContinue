# lib/math_utils/stats.py

def calculate_mean(values):
    # ZeroDivisionError when values list is empty
    if len(values) == 0:
        raise ZeroDivisionError("Cannot calculate mean of an empty list")
    return sum(values) / len(values)

def get_max_value(values):
    # ValueError when values list is empty
    if len(values) == 0:
        raise ValueError("Cannot get max value from an empty list")
    return max(values)

def calculate_std_dev(values):
    # ZeroDivisionError when values list is empty
    if len(values) == 0:
        raise ZeroDivisionError("Cannot calculate standard deviation of an empty list")
    mean = calculate_mean(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    return variance ** 0.5
