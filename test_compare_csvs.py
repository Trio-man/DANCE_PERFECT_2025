"""
Test the motion comparison using two existing CSV files (no server, no videos).
Run from project root:
  python test_compare_csvs.py
  python test_compare_csvs.py path/to/reference_motion.csv path/to/user_motion.csv
If no paths are given, uses motion_outputs/reference_motion.csv and motion_outputs/user_motion.csv.
"""
import sys
import os

# Add project root so we can import from testing
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from testing import compare_motion_csvs, write_result_log, OUTPUT_FOLDER, LOG_FOLDER

def main():
    if len(sys.argv) >= 3:
        ref_csv = sys.argv[1]
        user_csv = sys.argv[2]
    else:
        ref_csv = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
        user_csv = os.path.join(OUTPUT_FOLDER, "user_motion.csv")

    if not os.path.isfile(ref_csv):
        print(f"Reference CSV not found: {ref_csv}")
        sys.exit(1)
    if not os.path.isfile(user_csv):
        print(f"User CSV not found: {user_csv}")
        sys.exit(1)

    print("Comparing:")
    print(f"  Reference: {ref_csv}")
    print(f"  User:      {user_csv}")
    print()

    comparison = compare_motion_csvs(ref_csv, user_csv)
    log_path = write_result_log(
        video1_path="(reference CSV)",
        video2_path="(user CSV)",
        output1=ref_csv,
        output2=user_csv,
        comparison=comparison,
    )

    print("Comparison result:")
    for k, v in comparison.items():
        print(f"  {k}: {v}")
    print()
    print(f"Log file written: {log_path}")

if __name__ == "__main__":
    main()
