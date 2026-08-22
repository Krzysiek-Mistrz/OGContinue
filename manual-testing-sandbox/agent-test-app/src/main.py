# src/main.py
import sys
from pathlib import Path

# Add project root to sys.path for cross-folder resolution
sys.path.append(str(Path(__file__).parent.parent))

# Import error: wrong import target calculate_std_dev does not exist
from lib.math_utils.stats import calculate_mean, calculate_std_dev
from src.formatters.text import format_report

def run():
    user = "Admin"
    user_score = 95
    dataset = []

    # TypeError triggered inside nested formatter module
    print(format_report(user, user_score))

    # ZeroDivisionError triggered inside nested stats module
    avg = calculate_mean(dataset)
    print(f"Mean: {avg}")

if __name__ == "__main__":
    run()