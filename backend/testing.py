"""
This script defines a Flask API that:
- Accepts two uploaded dance videos (a reference and a user performance)
- Uses MediaPipe Pose + OpenCV to extract body landmarks frame by frame
- Stores all pose landmarks for each frame in CSV files using pandas

The resulting CSVs can be used later for analysis or scoring (e.g., how
closely the user's motion matches the reference).
"""

# Standard library for filesystem and path operations
import os
from datetime import datetime
import json

# OpenCV, used here to open/read video files and handle frames
import cv2

# MediaPipe, used for pose estimation (body landmarks)
import mediapipe as mp

# Pandas, used to store motion data in a table and write it to CSV
import pandas as pd
import numpy as np

# Flask components: app object, incoming request data, and JSON responses
from flask import Flask, request, jsonify

app = Flask(__name__)  # Create the Flask application instance

UPLOAD_FOLDER = "uploads"          # Folder where uploaded video files are saved
OUTPUT_FOLDER = "motion_outputs"   # Folder where generated CSV motion files go
LOG_FOLDER = "logs"                # Folder where result log files are written (one per run)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)   # Create upload folder if missing
os.makedirs(OUTPUT_FOLDER, exist_ok=True)   # Create output folder if missing
os.makedirs(LOG_FOLDER, exist_ok=True)      # Create log folder if missing

mp_pose = mp.solutions.pose  # Shortcut to the MediaPipe Pose solution


def extract_motion_from_video(video_path, output_csv):
    """
    Open a video file at `video_path`, run MediaPipe Pose on each frame,
    collect 3D body landmark coordinates (x, y, z, visibility) for every
    detected joint, and save all results into a CSV at `output_csv`.
    """
    # Open the video file for reading frames
    cap = cv2.VideoCapture(video_path)

    # Create a MediaPipe Pose object with settings tuned for video streams
    pose = mp_pose.Pose(
        static_image_mode=False,        # Process as a continuous video, not single images
        model_complexity=1,             # Mid-level complexity/accuracy
        smooth_landmarks=True,          # Smooth landmarks over time to reduce jitter
        min_detection_confidence=0.5,   # Minimum confidence to accept a pose detection
        min_tracking_confidence=0.5     # Minimum confidence to keep tracking over frames
    )

    data = []           # Will hold one row per (frame, landmark)
    frame_number = 0    # Tracks which frame we are on

    # Read frames until the video ends or an error occurs
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            # No more frames to read (end of video or read error)
            break

        frame_number += 1

        # MediaPipe expects RGB images; OpenCV provides BGR, so convert
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Run pose detection on the current frame
        results = pose.process(rgb_frame)

        # If a human pose was detected, iterate over all body landmarks
        if results.pose_landmarks:
            for landmark_id, lm in enumerate(results.pose_landmarks.landmark):
                # Append a row: frame index, landmark index, coordinates, and visibility
                data.append([
                    frame_number,
                    landmark_id,
                    lm.x,
                    lm.y,
                    lm.z,
                    lm.visibility
                ])

    # Release system resources for the video capture and pose model
    cap.release()
    pose.close()

    # Convert list of rows into a pandas DataFrame with named columns
    df = pd.DataFrame(
        data,
        columns=["frame", "landmark_id", "x", "y", "z", "visibility"]
    )

    # Save the motion data to CSV (no row index column)
    df.to_csv(output_csv, index=False)


def compare_motion_csvs(reference_csv_path, user_csv_path):
    """
    Compare two motion CSV files (reference vs user) produced by
    extract_motion_from_video. Loads both CSVs, aligns by frame number,
    and computes per-landmark Euclidean distance (x, y, z) for each frame.
    Returns a similarity score 0–100 (higher = better match) and summary stats.
    """
    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    ref_frames = set(ref_df["frame"].unique())
    user_frames = set(user_df["frame"].unique())
    common_frames = sorted(ref_frames & user_frames)

    if not common_frames:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No common frames to compare (check that both videos had pose detections).",
        }

    distances = []
    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        user_f = user_df.loc[user_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(user_f, on="landmark_id", suffixes=("_ref", "_user"))
        merged["dist"] = np.sqrt(
            (merged["x_ref"] - merged["x_user"]) ** 2
            + (merged["y_ref"] - merged["y_user"]) ** 2
            + (merged["z_ref"] - merged["z_user"]) ** 2
        )
        distances.extend(merged["dist"].tolist())

    mean_distance = float(np.mean(distances))
    # Similarity 0–100: normalized coords so distance typically in [0, ~1.5]; scale so 0 dist = 100, ~1 dist ≈ 0
    similarity_score = max(0.0, min(100.0, 100 - mean_distance * 100))

    return {
        "similarity_score": round(similarity_score, 2),
        "mean_landmark_distance": round(mean_distance, 6),
        "frames_compared": len(common_frames),
    }


def write_result_log(video1_path, video2_path, output1, output2, comparison):
    """
    Write a timestamped log file for this run with paths and comparison result.
    One log file is created per run in LOG_FOLDER (e.g. logs/motion_capture_2026-02-12_16-30-45.log).
    """
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_filename = f"motion_capture_{timestamp}.log"
    log_path = os.path.join(LOG_FOLDER, log_filename)

    lines = [
        "=" * 60,
        "MOTION CAPTURE RUN RESULT",
        "=" * 60,
        f"Timestamp: {datetime.now().isoformat()}",
        "",
        "Input videos:",
        f"  Reference: {video1_path}",
        f"  User:      {video2_path}",
        "",
        "Output CSVs:",
        f"  Reference motion: {output1}",
        f"  User motion:      {output2}",
        "",
        "Comparison:",
        f"  Similarity score (0-100):  {comparison.get('similarity_score', 'N/A')}",
        f"  Mean landmark distance:   {comparison.get('mean_landmark_distance', 'N/A')}",
        f"  Frames compared:          {comparison.get('frames_compared', 'N/A')}",
    ]
    if comparison.get("message"):
        lines.append(f"  Message: {comparison['message']}")
    lines.extend(["", "Full comparison (JSON):", json.dumps(comparison, indent=2), "", "=" * 60])

    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return log_path


@app.route("/upload-videos", methods=["POST"])
def upload_videos():
    """
    HTTP POST endpoint that expects two uploaded videos:
    - 'video1': the reference/perfect dance
    - 'video2': the user's dance performance

    It saves both videos, runs pose extraction on each, and returns the paths
    to the generated CSV motion files.
    """
    # Ensure both files were provided in the form-data
    if "video1" not in request.files or "video2" not in request.files:
        return jsonify({"error": "Two videos are required"}), 400

    # Access the uploaded files from the incoming request
    video1 = request.files["video1"]
    video2 = request.files["video2"]

    # Define where to save the uploaded videos on disk
    video1_path = os.path.join(UPLOAD_FOLDER, "dance_reference.mp4")
    video2_path = os.path.join(UPLOAD_FOLDER, "dance_user.mp4")

    # Save the uploaded videos to the upload folder
    video1.save(video1_path)
    video2.save(video2_path)

    # Define output CSV paths for the extracted motion data
    output1 = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
    output2 = os.path.join(OUTPUT_FOLDER, "user_motion.csv")

    # Run pose extraction on both videos
    extract_motion_from_video(video1_path, output1)
    extract_motion_from_video(video2_path, output2)

    # Compare the two motion CSVs and compute a similarity score
    comparison = compare_motion_csvs(output1, output2)

    # Write a log file for this run (one file per run, timestamped)
    log_path = write_result_log(video1_path, video2_path, output1, output2, comparison)

    # Respond with paths to the CSVs, the comparison result, and the log file
    return jsonify({
        "message": "Motion capture completed",
        "outputs": {
            "reference": output1,
            "user": output2
        },
        "comparison": comparison,
        "log_file": log_path
    })


if __name__ == "__main__":
    # When this file is run directly (python testing.py), start the Flask dev server.
    # debug=True is convenient for development (auto-reload and detailed error pages),
    # but you would typically disable it in production.
    app.run(debug=True)
