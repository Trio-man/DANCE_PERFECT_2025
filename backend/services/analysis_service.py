import pandas as pd
import numpy as np

def compare_kinematics(ref_path, user_path):
    ref_df = pd.read_csv(ref_path)
    user_df = pd.read_csv(user_path)

    # Extract joint columns (e.g., 'hip_x', 'hip_y', 'hip_z')
    joints = ['hip', 'knee', 'ankle', 'shoulder', 'elbow']
    axes = ['x', 'y', 'z']

    rmse_total = 0
    count = 0

    for joint in joints:
        for axis in axes:
            col = f"{joint}_{axis}"
            if col in ref_df.columns and col in user_df.columns:
                ref_vals = ref_df[col].values
                user_vals = user_df[col].values
                min_len = min(len(ref_vals), len(user_vals))
                rmse = np.sqrt(np.mean((ref_vals[:min_len] - user_vals[:min_len]) ** 2))
                rmse_total += rmse
                count += 1

    avg_rmse = rmse_total / count if count else 0
    return {
        'average_rmse': round(avg_rmse, 4),
        'joints_compared': count,
        'status': 'Kinematics comparison complete'
    }
