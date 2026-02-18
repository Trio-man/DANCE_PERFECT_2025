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

# DTW (Dynamic Time Warping) for time-aligned sequence comparison; euclidean for per-pose distance.
# Install with: pip install fastdtw scipy
try:
    from fastdtw import fastdtw  # type: ignore[import-untyped]
    from scipy.spatial.distance import euclidean
    _DTW_AVAILABLE = True
except ImportError:
    _DTW_AVAILABLE = False
    fastdtw = euclidean = None

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

# ----- DTW (Dynamic Time Warping) settings -----
# MediaPipe pose landmark IDs to use for DTW (focus on arms, legs, hips; fewer = faster).
# See: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
IMPORTANT_LANDMARKS = [
    11, 12, 13, 14, 15, 16,   # shoulders, elbows, wrists
    23, 24, 25, 26, 27, 28,   # hips, knees, ankles
    29, 30, 31, 32            # feet (tip, heel)
]
# Assumed frames per second for converting frame index to timestamp in logs (e.g. [1:30] = 1m30s).
DEFAULT_FPS = 30

# Body parts for feedback analysis: name -> [landmark_id, ...] (MediaPipe pose indices).
# Used to compare joint angles and limb positions between reference and user.
BODY_LANDMARKS = {
    "shoulders": [11, 12],   # left, right
    "elbows": [13, 14],
    "wrists": [15, 16],
    "hips": [23, 24],
    "knees": [25, 26],
    "ankles": [27, 28],
}


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


# ----- In-depth feedback analysis (where the user is falling behind / differing from reference) -----


def _frame_to_timestamp_str(frame_idx, fps=DEFAULT_FPS):
    """Convert frame index to [minutes:seconds] string for logs and feedback."""
    sec = frame_idx / fps
    return f"[{int(sec // 60)}:{int(sec % 60):02d}]"


def _get_point(df, frame, landmark_id):
    """Get (x, y, z) for a given frame and landmark from motion CSV; None if missing."""
    row = df[(df["frame"] == frame) & (df["landmark_id"] == landmark_id)]
    if row.empty:
        return None
    r = row.iloc[0]
    return np.array([r["x"], r["y"], r["z"]], dtype=float)


def _angle_at_vertex(a, b, c):
    """
    Compute angle at vertex b (in degrees) between segments b->a and b->c.
    Used for joint angles (e.g. knee = hip-knee-ankle, elbow = shoulder-elbow-wrist).
    """
    ba = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    bc = np.asarray(c, dtype=float) - np.asarray(b, dtype=float)
    n_ba = np.linalg.norm(ba)
    n_bc = np.linalg.norm(bc)
    if n_ba < 1e-9 or n_bc < 1e-9:
        return None
    cos_angle = np.dot(ba, bc) / (n_ba * n_bc)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


def _analyze_frame(ref_df, user_df, ref_f, user_f, fps=DEFAULT_FPS, ref_time=None, user_time=None):
    """
    Per-frame analysis: timing, arms, elbows, knees, torso.
    Returns a list of feedback strings for this aligned (ref_f, user_f) pair.
    If ref_time/user_time are provided (e.g. "[0:25]"), they are included in messages.
    """
    feedback = []
    ref_ts = ref_time or _frame_to_timestamp_str(ref_f, fps)
    user_ts = user_time or _frame_to_timestamp_str(user_f, fps)
    lag_sec = (user_f - ref_f) / fps

    # ----- Timing: user ahead = moving too fast; behind = moving too slow -----
    if lag_sec > 0.3:
        feedback.append(
            f"At {user_ts}: Timing is off — you are moving too slow (falling behind the reference)."
        )
    elif lag_sec < -0.3:
        feedback.append(
            f"At {user_ts}: Timing is off — you are moving too fast (ahead of the reference)."
        )

    # ----- Arm height (left and right): wrist relative to shoulder vs reference -----
    # MediaPipe y increases downward.
    for side_name, (shoulder_id, wrist_id) in [("Left", (11, 15)), ("Right", (12, 16))]:
        ref_shoulder = _get_point(ref_df, ref_f, shoulder_id)
        ref_wrist = _get_point(ref_df, ref_f, wrist_id)
        user_shoulder = _get_point(user_df, user_f, shoulder_id)
        user_wrist = _get_point(user_df, user_f, wrist_id)
        if None in (ref_shoulder, ref_wrist, user_shoulder, user_wrist):
            continue
        ref_rel = ref_wrist[1] - ref_shoulder[1]
        user_rel = user_wrist[1] - user_shoulder[1]
        if user_rel > ref_rel + 0.05:
            feedback.append(
                f"At {user_ts}: Your {side_name.lower()} arm is too low; reference has arm higher at {ref_ts}."
            )
        elif user_rel < ref_rel - 0.05:
            feedback.append(
                f"At {user_ts}: Your {side_name.lower()} arm is too high; reference has arm lower at {ref_ts}."
            )

    # ----- Elbow angle (left and right): bent vs straight vs reference -----
    for side_name, (shoulder_id, elbow_id, wrist_id) in [
        ("Left", (11, 13, 15)),
        ("Right", (12, 14, 16)),
    ]:
        ref_s = _get_point(ref_df, ref_f, shoulder_id)
        ref_e = _get_point(ref_df, ref_f, elbow_id)
        ref_w = _get_point(ref_df, ref_f, wrist_id)
        user_s = _get_point(user_df, user_f, shoulder_id)
        user_e = _get_point(user_df, user_f, elbow_id)
        user_w = _get_point(user_df, user_f, wrist_id)
        if None in (ref_s, ref_e, ref_w, user_s, user_e, user_w):
            continue
        ref_angle = _angle_at_vertex(ref_s, ref_e, ref_w)
        user_angle = _angle_at_vertex(user_s, user_e, user_w)
        if ref_angle is None or user_angle is None:
            continue
        # Straight arm ~160–180°; bent e.g. 90°
        ref_straight = ref_angle > 150
        user_straight = user_angle > 150
        if user_angle < ref_angle - 25:
            feedback.append(
                f"At {user_ts}: Your {side_name.lower()} arm is more bent than the reference at {ref_ts} "
                f"(reference arm is {'straight' if ref_straight else 'bent'})."
            )
        elif user_angle > ref_angle + 25:
            feedback.append(
                f"At {user_ts}: Your {side_name.lower()} arm is straighter than the reference at {ref_ts} "
                f"(reference arm is {'bent' if not ref_straight else 'straight'})."
            )

    # ----- Knee angle (left and right): bent vs straight, with explicit "user bent / reference not" -----
    for side_name, (hip_id, knee_id, ankle_id) in [("Left", (23, 25, 27)), ("Right", (24, 26, 28))]:
        ref_hip = _get_point(ref_df, ref_f, hip_id)
        ref_knee = _get_point(ref_df, ref_f, knee_id)
        ref_ankle = _get_point(ref_df, ref_f, ankle_id)
        user_hip = _get_point(user_df, user_f, hip_id)
        user_knee = _get_point(user_df, user_f, knee_id)
        user_ankle = _get_point(user_df, user_f, ankle_id)
        if None in (ref_hip, ref_knee, ref_ankle, user_hip, user_knee, user_ankle):
            continue
        ref_angle = _angle_at_vertex(ref_hip, ref_knee, ref_ankle)
        user_angle = _angle_at_vertex(user_hip, user_knee, user_ankle)
        if ref_angle is None or user_angle is None:
            continue
        ref_bent = ref_angle < 160
        user_bent = user_angle < 160
        if user_angle < ref_angle - 20:
            if not ref_bent:
                feedback.append(
                    f"At {user_ts}: Your {side_name.lower()} leg is bent while the reference's {side_name.lower()} leg "
                    f"is straight at {ref_ts}."
                )
            else:
                feedback.append(
                    f"At {user_ts}: Your {side_name.lower()} knee is too bent compared to the reference at {ref_ts}."
                )
        elif user_angle > ref_angle + 20:
            if ref_bent:
                feedback.append(
                    f"At {user_ts}: Your {side_name.lower()} leg is straight while the reference's {side_name.lower()} leg "
                    f"is bent at {ref_ts}."
                )
            else:
                feedback.append(
                    f"At {user_ts}: Your {side_name.lower()} knee is too straight compared to the reference at {ref_ts}."
                )

    # ----- Torso lean: compare hip midpoint to shoulder midpoint (forward/back and left/right) -----
    ref_l_hip = _get_point(ref_df, ref_f, 23)
    ref_r_hip = _get_point(ref_df, ref_f, 24)
    ref_l_shoulder = _get_point(ref_df, ref_f, 11)
    ref_r_shoulder = _get_point(ref_df, ref_f, 12)
    user_l_hip = _get_point(user_df, user_f, 23)
    user_r_hip = _get_point(user_df, user_f, 24)
    user_l_shoulder = _get_point(user_df, user_f, 11)
    user_r_shoulder = _get_point(user_df, user_f, 12)
    if None not in (ref_l_hip, ref_r_hip, ref_l_shoulder, ref_r_shoulder,
                    user_l_hip, user_r_hip, user_l_shoulder, user_r_shoulder):
        ref_hip_mid = (ref_l_hip + ref_r_hip) / 2
        ref_shoulder_mid = (ref_l_shoulder + ref_r_shoulder) / 2
        user_hip_mid = (user_l_hip + user_r_hip) / 2
        user_shoulder_mid = (user_l_shoulder + user_r_shoulder) / 2
        # Rough lean: x diff (horizontal) and z diff (forward/back in normalized coords)
        ref_lean_x = ref_shoulder_mid[0] - ref_hip_mid[0]
        ref_lean_z = ref_shoulder_mid[2] - ref_hip_mid[2]
        user_lean_x = user_shoulder_mid[0] - user_hip_mid[0]
        user_lean_z = user_shoulder_mid[2] - user_hip_mid[2]
        thresh = 0.04
        if user_lean_x > ref_lean_x + thresh:
            feedback.append(
                f"At {user_ts}: Your torso is leaning right compared to the reference at {ref_ts}."
            )
        elif user_lean_x < ref_lean_x - thresh:
            feedback.append(
                f"At {user_ts}: Your torso is leaning left compared to the reference at {ref_ts}."
            )
        if user_lean_z > ref_lean_z + thresh:
            feedback.append(
                f"At {user_ts}: Your torso is leaning forward compared to the reference at {ref_ts}."
            )
        elif user_lean_z < ref_lean_z - thresh:
            feedback.append(
                f"At {user_ts}: Your torso is leaning back compared to the reference at {ref_ts}."
            )

    # ----- Arm symmetry: if reference has one arm up and one down, check user matches -----
    for (ref_left_w, ref_right_w, user_left_w, user_right_w) in [(
        _get_point(ref_df, ref_f, 15), _get_point(ref_df, ref_f, 16),
        _get_point(user_df, user_f, 15), _get_point(user_df, user_f, 16),
    )]:
        if None in (ref_left_w, ref_right_w, user_left_w, user_right_w):
            break
        ref_left_above_right = ref_left_w[1] < ref_right_w[1]  # smaller y = higher
        ref_right_above_left = ref_right_w[1] < ref_left_w[1]
        user_left_above_right = user_left_w[1] < user_right_w[1]
        user_right_above_left = user_right_w[1] < user_left_w[1]
        # Asymmetric in reference but user has wrong asymmetry
        if ref_left_above_right and not ref_right_above_left and (user_right_above_left or abs(user_left_w[1] - user_right_w[1]) < 0.03):
            feedback.append(
                f"At {user_ts}: Reference has left arm raised at {ref_ts}; your arms are not in the same pose."
            )
        elif ref_right_above_left and not ref_left_above_right and (user_left_above_right or abs(user_left_w[1] - user_right_w[1]) < 0.03):
            feedback.append(
                f"At {user_ts}: Reference has right arm raised at {ref_ts}; your arms are not in the same pose."
            )

    return feedback


def run_feedback_analysis(ref_df, user_df, path, fps=DEFAULT_FPS, sample_every=15):
    """
    Run per-frame feedback analysis along the DTW alignment path.
    path: list of (ref_idx, user_idx) from fastdtw.
    Samples every sample_every pairs to keep output size reasonable; each entry includes
    reference_time, user_time, and list of feedback strings for that moment (with timestamps in text).
    """
    entries = []
    for i in range(0, len(path), sample_every):
        ref_idx, user_idx = path[i]
        ref_idx, user_idx = int(ref_idx), int(user_idx)
        ref_time = _frame_to_timestamp_str(ref_idx, fps)
        user_time = _frame_to_timestamp_str(user_idx, fps)
        fb = _analyze_frame(
            ref_df, user_df, ref_idx, user_idx, fps=fps, ref_time=ref_time, user_time=user_time
        )
        if fb:
            entries.append({
                "reference_frame": ref_idx,
                "user_frame": user_idx,
                "reference_time": _frame_to_timestamp_str(ref_idx, fps),
                "user_time": _frame_to_timestamp_str(user_idx, fps),
                "feedback": fb,
            })
    return entries


def build_pose_sequence(df):
    """
    Build a time-ordered sequence of pose vectors from a motion CSV for DTW.
    Each frame becomes one vector: for IMPORTANT_LANDMARKS we concatenate (x, y, z)
    in a fixed order. Missing landmarks are filled with (0, 0, 0).
    Returns a list of 1D numpy arrays, one per frame.
    """
    frames = sorted(df["frame"].unique())
    sequence = []

    for frame in frames:
        frame_data = df[df["frame"] == frame]
        pose_vector = []

        for lm_id in IMPORTANT_LANDMARKS:
            lm_data = frame_data[frame_data["landmark_id"] == lm_id]
            if not lm_data.empty:
                row = lm_data.iloc[0]
                pose_vector.extend([row["x"], row["y"], row["z"]])
            else:
                pose_vector.extend([0.0, 0.0, 0.0])

        sequence.append(np.array(pose_vector, dtype=float))

    return sequence


def compare_motion_csvs_dtw(reference_csv_path, user_csv_path, fps=DEFAULT_FPS, path_sample_step=20):
    """
    Compare two motion CSVs using Dynamic Time Warping (DTW).
    DTW finds the best alignment between two sequences of different lengths (e.g. reference
    and user danced at different speeds), so we get one global distance and an alignment path.
    Uses only IMPORTANT_LANDMARKS to keep vectors smaller and comparison stable.
    Returns dict with dtw_distance, alignment path sample (reference_frame <-> user_frame),
    and optional message if fastdtw/scipy are not installed.
    """
    if not _DTW_AVAILABLE:
        return {
            "dtw_distance": None,
            "dtw_similarity_score": None,
            "aligned_moments": [],
            "feedback_analysis": [],
            "message": "DTW skipped: install fastdtw and scipy (pip install fastdtw scipy).",
        }

    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    # Build one pose vector per frame (only important landmarks)
    ref_sequence = build_pose_sequence(ref_df)
    user_sequence = build_pose_sequence(user_df)

    if not ref_sequence or not user_sequence:
        return {
            "dtw_distance": None,
            "dtw_similarity_score": None,
            "aligned_moments": [],
            "feedback_analysis": [],
            "message": "One or both CSVs had no frames with pose data.",
        }

    # Run FastDTW: distance = total cost of the best alignment; path = list of (ref_idx, user_idx)
    distance, path = fastdtw(ref_sequence, user_sequence, dist=euclidean)

    # Normalize by path length so longer videos don't always get huge distances; then scale to 0–100
    path_len = max(len(path), 1)
    normalized_distance = distance / path_len
    # Higher distance = worse match. Map to similarity 0–100 (heuristic scale; adjust if needed).
    dtw_similarity_score = max(0.0, min(100.0, 100 - normalized_distance * 50))

    def frame_to_timestamp(frame_idx, fps=fps):
        """Convert frame index to [minutes:seconds] for logging."""
        seconds = frame_idx / fps
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"[{minutes}:{secs:02d}]"

    # Sample the alignment path every path_sample_step to show where reference and user frames were matched
    aligned_moments = []
    for i in range(0, len(path), path_sample_step):
        ref_idx, user_idx = path[i]
        aligned_moments.append({
            "reference_frame": int(ref_idx),
            "user_frame": int(user_idx),
            "reference_time": frame_to_timestamp(ref_idx),
            "user_time": frame_to_timestamp(user_idx),
        })

    # In-depth feedback: where the user is falling behind or differing from reference (timing, arms, knees)
    feedback_analysis = run_feedback_analysis(ref_df, user_df, path, fps=fps, sample_every=15)

    return {
        "dtw_distance": round(distance, 4),
        "dtw_normalized_distance": round(normalized_distance, 6),
        "dtw_similarity_score": round(dtw_similarity_score, 2),
        "path_length": len(path),
        "aligned_moments": aligned_moments,
        "feedback_analysis": feedback_analysis,
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
        "Comparison (frame-by-frame):",
        f"  Similarity score (0-100):  {comparison.get('similarity_score', 'N/A')}",
        f"  Mean landmark distance:   {comparison.get('mean_landmark_distance', 'N/A')}",
        f"  Frames compared:          {comparison.get('frames_compared', 'N/A')}",
    ]
    if comparison.get("message"):
        lines.append(f"  Message: {comparison['message']}")
    # DTW section (if present)
    if comparison.get("dtw_distance") is not None:
        lines.extend([
            "",
            "DTW (Dynamic Time Warping):",
            f"  DTW distance:              {comparison.get('dtw_distance', 'N/A')}",
            f"  DTW normalized distance:   {comparison.get('dtw_normalized_distance', 'N/A')}",
            f"  DTW similarity score:      {comparison.get('dtw_similarity_score', 'N/A')}",
            f"  Path length:               {comparison.get('path_length', 'N/A')}",
        ])
    if comparison.get("dtw_message"):
        lines.append(f"  DTW message: {comparison['dtw_message']}")
    if comparison.get("aligned_moments") and isinstance(comparison["aligned_moments"], list):
        lines.append("")
        lines.append("Aligned moments (reference time <-> user time), sampled every 20 matches:")
        for m in comparison["aligned_moments"]:
            lines.append(f"  Reference {m['reference_time']} <-> User {m['user_time']}")
    # In-depth feedback: where user is falling behind or differing from reference
    if comparison.get("feedback_analysis") and isinstance(comparison["feedback_analysis"], list):
        lines.append("")
        lines.append("Feedback (where you differ from reference), sampled along DTW path:")
        for entry in comparison["feedback_analysis"]:
            lines.append(f"  {entry.get('reference_time', '')} (ref) <-> {entry.get('user_time', '')} (user):")
            for fb in entry.get("feedback", []):
                lines.append(f"    - {fb}")
    lines.extend(["", "Full comparison (JSON):", json.dumps(comparison, indent=2, default=str), "", "=" * 60])

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

    # Compare the two motion CSVs: frame-by-frame similarity and DTW (time-warped) comparison
    comparison = compare_motion_csvs(output1, output2)
    dtw_result = compare_motion_csvs_dtw(output1, output2)
    comparison["dtw_message"] = dtw_result.pop("message", None)
    comparison.update(dtw_result)

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
