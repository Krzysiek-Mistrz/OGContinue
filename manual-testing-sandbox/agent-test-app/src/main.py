# src/main.py
import sys
from pathlib import Path

# Add project root to sys.path for cross-folder resolution
sys.path.append(str(Path(__file__).parent.parent))

from lib.math_utils.stats import calculate_mean
from src.formatters.text import format_report

def run():
    user = "Admin"
    user_score = 95
    dataset = [10, 20, 30, 40, 50]
    # TypeError triggered inside nested formatter module
    print(format_report(user, user_score))

    # ZeroDivisionError triggered inside nested stats module
    avg = calculate_mean(dataset)
    print(f'Average: {avg}')

if __name__ == "__main__":
    run()