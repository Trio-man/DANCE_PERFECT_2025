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
import re
from datetime import datetime
import json
import csv
import heapq
import gc

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
from flask_cors import CORS

app = Flask(__name__)  # Create the Flask application instance
CORS(app)
# ----- Optional: cloud storage for generated files (log, tips, screenshots) -----
# Set STORAGE_PROVIDER to "supabase" or "s3" and the corresponding env vars (see below).
# If unset or empty, files stay on disk and response uses local paths only.
def _upload_file_to_storage(local_path, storage_key):
    """
    Upload a local file to configured cloud storage. Returns public URL or None.
    Env vars (groupmate fills these):
      - STORAGE_PROVIDER: "supabase" | "s3" | "" (disabled)
      Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET
      S3: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION (optional), S3_PUBLIC_BASE_URL (optional)
    """
    provider = os.environ.get("STORAGE_PROVIDER", "").strip().lower()
    if not provider or not os.path.isfile(local_path):
        return None
    try:
        if provider == "supabase":
            url = os.environ.get("SUPABASE_URL", "").strip()
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or os.environ.get("SUPABASE_STORAGE_KEY", "").strip()
            bucket = os.environ.get("STORAGE_BUCKET", "analysis-assets").strip()
            if not url or not key:
                return None
            try:
                from supabase import create_client
                client = create_client(url, key)
                with open(local_path, "rb") as f:
                    client.storage.from_(bucket).upload(storage_key, f, file_options={"content-type": "application/octet-stream"})
                public = client.storage.from_(bucket).get_public_url(storage_key)
                return public
            except Exception:
                return None
        if provider == "s3":
            bucket = os.environ.get("S3_BUCKET", "").strip()
            region = os.environ.get("S3_REGION", "us-east-1")
            if not bucket:
                return None
            try:
                import boto3
                from botocore.config import Config
                s3 = boto3.client(
                    "s3",
                    region_name=region,
                    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", ""),
                    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", ""),
                    config=Config(signature_version="s3v4"),
                )
                content_type = "text/plain" if local_path.endswith(".log") or local_path.endswith(".txt") else "image/png"
                s3.upload_file(local_path, bucket, storage_key, ExtraArgs={"ContentType": content_type})
                base = os.environ.get("S3_PUBLIC_BASE_URL", "").strip()
                if base:
                    return f"{base.rstrip('/')}/{storage_key}" if not base.endswith("/") else f"{base}{storage_key}"
                return f"https://{bucket}.s3.{region}.amazonaws.com/{storage_key}"
            except Exception:
                return None
    except Exception:
        pass
    return None

UPLOAD_FOLDER = "uploads"          # Folder where uploaded video files are saved
OUTPUT_FOLDER = "motion_outputs"   # Folder where generated CSV motion files go
LOG_FOLDER = "logs"                # Folder where result log files are written (one per run)
TIPS_FOLDER = "tips"               # Folder for clean practice tips files (one per run)
DEVIATION_SCREENSHOTS_FOLDER = "deviation_screenshots"  # Screenshots with pose overlay where user deviates most
POSE_MATCH_SCREENSHOTS_FOLDER = "pose_match_screenshots"  # Screenshots where user pose is most identical to reference

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(TIPS_FOLDER, exist_ok=True)
os.makedirs(DEVIATION_SCREENSHOTS_FOLDER, exist_ok=True)
os.makedirs(POSE_MATCH_SCREENSHOTS_FOLDER, exist_ok=True)

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Singleton Pose instance for video extraction — loaded once at startup
_POSE_VIDEO = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Singleton Pose instance for static image processing (screenshots)
_POSE_IMAGE = mp_pose.Pose(
    static_image_mode=True,
    model_complexity=1,
    min_detection_confidence=0.5,
)

# ----- DTW (Dynamic Time Warping) settings -----
# MediaPipe pose landmark IDs to use for DTW (focus on arms, legs, hips; fewer = faster).
# See: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
IMPORTANT_LANDMARKS = [
    11, 12, 13, 14, 15, 16,   # shoulders, elbows, wrists
    23, 24, 25, 26, 27, 28,   # hips, knees, ankles
    29, 30, 31, 32            # feet (tip, heel)
]
# Indices into the pose vector (3 floats per landmark in IMPORTANT_LANDMARKS order) for normalization.
# Landmark 11 = index 0, 12 = 1, ..., 23 = 6, 24 = 7 → vector positions 18:24 are hip left/right.
HIP_LEFT_VEC_IDX = 6 * 3   # 18: landmark 23
HIP_RIGHT_VEC_IDX = 7 * 3  # 21: landmark 24
SHOULDER_LEFT_VEC_IDX = 0 * 3   # 0: landmark 11
SHOULDER_RIGHT_VEC_IDX = 1 * 3  # 3: landmark 12
# ----- Motion capture and timestamps: single source of truth for any uploaded video -----
# All motion CSVs are produced at most MOTION_FPS frames per second. Timestamps (e.g. [0:15])
# are always computed as frame_index / motion_fps, so they match real time regardless of
# the user's video FPS (24, 30, 60, 120, etc.).
MOTION_FPS = 8
DEFAULT_FPS = MOTION_FPS
MAX_FPS = MOTION_FPS
# Downscale frames before pose inference to reduce CPU/RAM. Keep aspect ratio.
MAX_PROCESS_FRAME_LONG_SIDE = 640

# ----- Acceptable deviation for dancer comparison -----
ACCEPTABLE_SIMILARITY_PERCENT = 80  # Minimum similarity to be "within acceptable range"

# ----- Deviation and pose-match screenshots -----
# Number of moments to capture: worst deviations (negative) and most identical pose (positive).
NUM_DEVIATION_SCREENSHOTS = 3   # Frames where user deviates most from reference
NUM_POSE_MATCH_SCREENSHOTS = 3  # Frames where user pose is most identical to reference
# Only count as "pose match" when normalized pose distance is below this (stricter = more identical).
POSE_MATCH_MAX_DISTANCE = 0.15  # Pairs with distance > this are excluded from best_pose_matches

# ----- Motion detection: trim standing-still at start/end -----
# Per-frame "activity" = mean landmark displacement from previous frame (normalized coords).
# Frames with activity below this are treated as standing still and excluded from comparison.
MOTION_ACTIVITY_THRESHOLD = 0.006
# Minimum number of consecutive "active" frames to consider movement started/ended (reduces noise).
MIN_ACTIVE_RUN_FRAMES = 5
# Cooldown: skip this many frames after motion "start" (and before motion "end") so we do not
# include resting/transition poses. Comparison starts when the dance has actually begun.
MOTION_START_COOLDOWN_FRAMES = 4    # ~0.5 s at 8 FPS; avoids first standing/transition section
MOTION_END_COOLDOWN_FRAMES = 4      # same logic at end to avoid wind-down section
# Skip core ("crunch") feedback for this many frames from start so we don't flag the starting stance.
FEEDBACK_CORE_START_COOLDOWN_FRAMES = 12  # ~1.5 s at 8 FPS
# Reference torso vertical span below this = "crunching" (torso lowered). Above = standing.
REF_TORSO_CRUNCH_THRESHOLD = 0.22  # normalized; ref must be below this to count as crunch

# Body parts for feedback analysis: name -> [landmark_id, ...] (MediaPipe pose indices).
BODY_LANDMARKS = {
    "shoulders": [11, 12],   # left, right
    "elbows": [13, 14],
    "wrists": [15, 16],
    "hips": [23, 24],
    "knees": [25, 26],
    "ankles": [27, 28],
}


def get_video_info(video_path):
    """
    Get frame count, FPS, and duration of the original video file (for display only).
    Timestamps in feedback use the motion CSV's effective FPS from extract_motion_from_video.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps_raw = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    if fps_raw <= 0:
        fps_raw = float(DEFAULT_FPS)
    fps_raw = float(fps_raw)
    duration_sec = frame_count / fps_raw if frame_count else 0.0
    return {
        "frame_count": frame_count,
        "fps": round(fps_raw, 2),
        "duration_sec": round(duration_sec, 2),
    }


def extract_motion_from_video(video_path, output_csv, max_fps=MAX_FPS):
    """
    Run pose detection on the video and write motion to CSV. Motion is limited to
    max_fps (default 8): higher-FPS videos are sampled so output has at most 8 FPS;
    lower-FPS videos keep every frame. Returns the effective FPS of the output CSV
    so timestamps (frame_index / effective_fps) match real time for any upload.
    """
    cap = cv2.VideoCapture(video_path)
    fps_src = cap.get(cv2.CAP_PROP_FPS)
    if fps_src <= 0:
        fps_src = float(DEFAULT_FPS)
    fps_src = float(fps_src)
    step = max(1, round(fps_src / max_fps))
    effective_fps = fps_src / step  # FPS of the output CSV (at most max_fps)

    source_index = 0   # 0-based index of current source frame
    output_frame_number = 0   # 1-based frame number written to CSV (at max_fps rate)
    with open(output_csv, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.writer(out_f)
        writer.writerow(["frame", "landmark_id", "x", "y", "z", "visibility"])

        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            # Only process this frame if it falls on our max_fps grid.
            if source_index % step == 0:
                output_frame_number += 1

                # Resize large frames before pose processing to reduce memory/CPU.
                h, w = frame.shape[:2]
                long_side = max(h, w)
                if long_side > MAX_PROCESS_FRAME_LONG_SIDE:
                    scale = MAX_PROCESS_FRAME_LONG_SIDE / float(long_side)
                    new_w = max(1, int(w * scale))
                    new_h = max(1, int(h * scale))
                    frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = _POSE_VIDEO.process(rgb_frame)

                if results.pose_landmarks:
                    for landmark_id, lm in enumerate(results.pose_landmarks.landmark):
                        writer.writerow([
                            output_frame_number,
                            landmark_id,
                            lm.x,
                            lm.y,
                            lm.z,
                            lm.visibility
                        ])

                # Release per-frame temporaries ASAP in low-memory environments.
                del rgb_frame, results, frame
            else:
                del frame
            source_index += 1

            # Periodic GC helps long videos on constrained hosts.
            if source_index % 300 == 0:
                gc.collect()

    cap.release()
    return round(effective_fps, 2)


def save_deviation_screenshot(video_path, frame_number_1based, output_path, fps=DEFAULT_FPS):
    """
    Read the frame at frame_number_1based (1-based) from the video, run MediaPipe Pose,
    draw the skeleton overlay and a timestamp at the bottom, then save to output_path.
    Returns output_path on success, None on failure.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, frame_number_1based - 1))
    success, frame = cap.read()
    cap.release()
    if not success or frame is None:
        return None

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    results = _POSE_IMAGE.process(rgb)

    if results.pose_landmarks:
        mp_drawing.draw_landmarks(
            frame,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style(),
        )

    # Timestamp at bottom: [m:ss] from frame number and fps
    sec = (frame_number_1based - 1) / max(float(fps), 1e-6)
    minutes = int(sec // 60)
    seconds = int(sec % 60)
    timestamp_str = f"[{minutes}:{seconds:02d}]"
    h, w = frame.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.0
    thickness = 2
    (tw, th), _ = cv2.getTextSize(timestamp_str, font, font_scale, thickness)
    # Draw a dark bar at the bottom so text is readable
    y_bar = h - 40
    cv2.rectangle(frame, (0, y_bar), (w, h), (0, 0, 0), -1)
    cv2.putText(
        frame, timestamp_str,
        (w // 2 - tw // 2, h - 12),
        font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA
    )

    try:
        cv2.imwrite(output_path, frame)
        return output_path
    except Exception:
        return None


def _landmarks_normalized(pose_landmarks):
    """Return list of (x, y) normalized 0-1 for each of the 33 landmarks, or None if missing."""
    if not pose_landmarks or not pose_landmarks.landmark:
        return None
    return [(lm.x, lm.y) for lm in pose_landmarks.landmark]


def _mismatched_landmark_indices(ref_pts, user_pts, distance_thresh=0.08):
    """Return set of landmark indices where user position differs from reference (normalized distance > thresh)."""
    if not ref_pts or not user_pts or len(ref_pts) != len(user_pts):
        return set()
    mismatched = set()
    for i in range(min(len(ref_pts), len(user_pts))):
        d = ((ref_pts[i][0] - user_pts[i][0]) ** 2 + (ref_pts[i][1] - user_pts[i][1]) ** 2) ** 0.5
        if d > distance_thresh:
            mismatched.add(i)
    return mismatched


def save_deviation_comparison_image(
    ref_video_path,
    user_video_path,
    ref_frame_1based,
    user_frame_1based,
    ref_motion_fps,
    user_motion_fps,
    output_path,
    tips_list=None,
    user_label=None,
    landmark_match_thresh=None,
):
    """
    Create a side-by-side image: reference (left), user (right). User's landmarks: green = matching
    reference, red = not matching. Tips at the bottom. user_label: caption on the right.
    landmark_match_thresh: max normalized distance for a landmark to count as matching (default 0.08);
    use a lower value (e.g. 0.04) for pose-match images so only very close poses show as green.
    """
    cap_ref = cv2.VideoCapture(ref_video_path)
    cap_user = cv2.VideoCapture(user_video_path)
    if not cap_ref.isOpened() or not cap_user.isOpened():
        if cap_ref.isOpened():
            cap_ref.release()
        if cap_user.isOpened():
            cap_user.release()
        return None
    ref_video_fps = max(1e-6, cap_ref.get(cv2.CAP_PROP_FPS))
    user_video_fps = max(1e-6, cap_user.get(cv2.CAP_PROP_FPS))
    ref_step = max(1, round(ref_video_fps / ref_motion_fps))
    user_step = max(1, round(user_video_fps / user_motion_fps))
    ref_video_idx = (ref_frame_1based - 1) * ref_step
    user_video_idx = (user_frame_1based - 1) * user_step
    cap_ref.set(cv2.CAP_PROP_POS_FRAMES, ref_video_idx)
    cap_user.set(cv2.CAP_PROP_POS_FRAMES, user_video_idx)
    ok_ref, frame_ref = cap_ref.read()
    ok_user, frame_user = cap_user.read()
    cap_ref.release()
    cap_user.release()
    if not ok_ref or not ok_user or frame_ref is None or frame_user is None:
        return None

    rgb_ref = cv2.cvtColor(frame_ref, cv2.COLOR_BGR2RGB)
    rgb_user = cv2.cvtColor(frame_user, cv2.COLOR_BGR2RGB)
    res_ref = _POSE_IMAGE.process(rgb_ref)
    res_user = _POSE_IMAGE.process(rgb_user)
    if not res_ref.pose_landmarks or not res_user.pose_landmarks:
        return None

    ref_pts = _landmarks_normalized(res_ref.pose_landmarks)
    user_pts = _landmarks_normalized(res_user.pose_landmarks)
    thresh = landmark_match_thresh if landmark_match_thresh is not None else 0.08
    mismatched = _mismatched_landmark_indices(ref_pts, user_pts, distance_thresh=thresh)

    # Draw reference (left) with default skeleton
    frame_ref_bgr = frame_ref.copy()
    mp_drawing.draw_landmarks(
        frame_ref_bgr,
        res_ref.pose_landmarks,
        mp_pose.POSE_CONNECTIONS,
        landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style(),
    )

    # Draw user (right): default style for matching landmarks, RED for mismatched
    frame_user_bgr = frame_user.copy()
    h, w = frame_user_bgr.shape[:2]
    connections = mp_pose.POSE_CONNECTIONS
    for conn in connections:
        a, b = conn
        if a >= len(user_pts) or b >= len(user_pts):
            continue
        pt_a = (int(user_pts[a][0] * w), int(user_pts[a][1] * h))
        pt_b = (int(user_pts[b][0] * w), int(user_pts[b][1] * h))
        color = (0, 0, 255) if (a in mismatched or b in mismatched) else (0, 255, 0)
        cv2.line(frame_user_bgr, pt_a, pt_b, color, 2, cv2.LINE_AA)
    for i, (x, y) in enumerate(user_pts):
        pt = (int(x * w), int(y * h))
        color = (0, 0, 255) if i in mismatched else (0, 255, 0)
        cv2.circle(frame_user_bgr, pt, 5, color, -1, cv2.LINE_AA)
        cv2.circle(frame_user_bgr, pt, 5, (255, 255, 255), 1, cv2.LINE_AA)

    # Resize to same height
    h1, w1 = frame_ref_bgr.shape[:2]
    h2, w2 = frame_user_bgr.shape[:2]
    target_h = max(h1, h2)
    if h1 != target_h:
        frame_ref_bgr = cv2.resize(frame_ref_bgr, (int(w1 * target_h / h1), target_h))
    if h2 != target_h:
        frame_user_bgr = cv2.resize(frame_user_bgr, (int(w2 * target_h / h2), target_h))
    w_left = frame_ref_bgr.shape[1]
    side_by_side = np.hstack([frame_ref_bgr, frame_user_bgr])

    # Labels above (Reference left; You + legend on the right, right-aligned)
    cv2.putText(side_by_side, "Reference", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    if user_label is None:
        user_label = "You. Red glowing line means the body part is not matching the choreographer."
    (tw, th), _ = cv2.getTextSize(user_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    x_right = side_by_side.shape[1] - tw - 10
    cv2.putText(side_by_side, user_label, (max(x_right, w_left + 10), 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)

    # Tips at the bottom: add a panel and wrap text
    tips_list = tips_list or []
    if tips_list:
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.45
        thickness = 1
        line_height = 22
        margin = 12
        max_chars_per_line = 80
        lines = ["Tips:"]
        for tip in tips_list[:6]:
            tip = (tip.strip() or "").strip("• ")
            if not tip:
                continue
            while len(tip) > max_chars_per_line:
                lines.append(tip[:max_chars_per_line])
                tip = tip[max_chars_per_line:].lstrip()
            if tip:
                lines.append(tip)
        tips_height = margin * 2 + len(lines) * line_height
        panel = np.zeros((tips_height, side_by_side.shape[1], 3), dtype=np.uint8)
        panel[:] = (40, 40, 40)
        y = margin + line_height
        for i, line in enumerate(lines):
            color = (180, 255, 180) if i == 0 else (220, 220, 220)
            cv2.putText(panel, line, (margin, y), font, font_scale if i > 0 else 0.5, color, thickness, cv2.LINE_AA)
            y += line_height
        side_by_side = np.vstack([side_by_side, panel])

    try:
        cv2.imwrite(output_path, side_by_side)
        return output_path
    except Exception:
        return None


def _activity_per_frame(df, landmark_ids=None):
    """
    Per-frame motion activity: mean Euclidean distance of landmark positions
    from the previous frame (normalized coords). First frame gets 0.
    Returns series indexed by frame number.
    """
    if landmark_ids is None:
        landmark_ids = IMPORTANT_LANDMARKS
    frames = sorted(df["frame"].unique())
    if len(frames) < 2:
        return pd.Series(dtype=float)

    # Build pose vector per frame (x,y,z for each landmark in order)
    pose_by_frame = {}
    for f in frames:
        frame_data = df[df["frame"] == f]
        vec = []
        for lm_id in landmark_ids:
            row = frame_data[frame_data["landmark_id"] == lm_id]
            if not row.empty:
                r = row.iloc[0]
                vec.extend([r["x"], r["y"], r["z"]])
            else:
                vec.extend([0.0, 0.0, 0.0])
        pose_by_frame[f] = np.array(vec, dtype=float)

    activity = {}
    for i, f in enumerate(frames):
        if i == 0:
            activity[f] = 0.0
        else:
            prev_f = frames[i - 1]
            d = np.linalg.norm(pose_by_frame[f] - pose_by_frame[prev_f])
            activity[f] = float(d)
    return pd.Series(activity)


def detect_motion_range(
    df,
    activity_threshold=MOTION_ACTIVITY_THRESHOLD,
    min_run_frames=MIN_ACTIVE_RUN_FRAMES,
    start_cooldown_frames=MOTION_START_COOLDOWN_FRAMES,
    end_cooldown_frames=MOTION_END_COOLDOWN_FRAMES,
):
    """
    Find the frame range where the dancer is actually moving (not standing still).
    Applies a cooldown after motion start (and before motion end) so resting/transition
    poses are excluded; calculation starts when the dance has begun.
    Returns (start_frame, end_frame) 1-based inclusive, or (first_frame, last_frame) if no clear segment.
    """
    frames = sorted(df["frame"].unique())
    if len(frames) < 2:
        return (frames[0], frames[0]) if frames else (1, 1)

    activity = _activity_per_frame(df)
    # Active = activity above threshold (align by frame order)
    active_list = [activity.get(f, 0) > activity_threshold for f in frames]

    # Find longest run of active frames of length >= min_run_frames
    run_start = None
    run_end = None
    best_len = 0
    i = 0
    while i < len(frames):
        if active_list[i]:
            j = i
            while j < len(frames) and active_list[j]:
                j += 1
            run_len = j - i
            if run_len >= min_run_frames and run_len > best_len:
                best_len = run_len
                run_start = frames[i]
                run_end = frames[j - 1]
            i = j
        else:
            i += 1

    if run_start is not None and run_end is not None:
        # Cooldown: skip frames at start and end to avoid resting/transition poses
        start_with_cooldown = run_start + start_cooldown_frames
        end_with_cooldown = run_end - end_cooldown_frames
        if start_with_cooldown <= end_with_cooldown:
            return (int(start_with_cooldown), int(end_with_cooldown))
        # Cooldown would remove entire range; return a single-frame range at center
        mid = (run_start + run_end) // 2
        return (int(mid), int(mid))
    # No long enough run: use full range
    return (int(frames[0]), int(frames[-1]))


def trim_df_to_active_range(df, start_frame, end_frame):
    """
    Keep only rows with frame in [start_frame, end_frame] and renumber frames to 1, 2, 3, ...
    So the first active frame becomes 1. Returns a new DataFrame.
    """
    trimmed = df[(df["frame"] >= start_frame) & (df["frame"] <= end_frame)].copy()
    if trimmed.empty:
        return trimmed
    # Renumber: old frame -> new frame (1-based consecutive)
    old_frames = sorted(trimmed["frame"].unique())
    mapping = {old: i + 1 for i, old in enumerate(old_frames)}
    trimmed["frame"] = trimmed["frame"].map(mapping)
    return trimmed


def compare_motion_csvs(reference_csv_path, user_csv_path):
    """
    Compare two motion CSV files. Trims standing-still at start/end so only the
    segment where movement actually happens is compared. Returns similarity 0–100 and summary stats.
    """
    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    # Trim to active motion range (skip standing still at start/end)
    ref_start, ref_end = detect_motion_range(ref_df)
    user_start, user_end = detect_motion_range(user_df)
    ref_df = trim_df_to_active_range(ref_df, ref_start, ref_end)
    user_df = trim_df_to_active_range(user_df, user_start, user_end)

    ref_frames = set(ref_df["frame"].unique())
    user_frames = set(user_df["frame"].unique())
    common_frames = sorted(ref_frames & user_frames)

    if not common_frames:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "motion_range_reference": [ref_start, ref_end],
            "motion_range_user": [user_start, user_end],
            "message": "No common frames to compare (check that both videos had pose detections).",
        }

    dist_sum = 0.0
    dist_count = 0
    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        user_f = user_df.loc[user_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(user_f, on="landmark_id", suffixes=("_ref", "_user"))
        merged["dist"] = np.sqrt(
            (merged["x_ref"] - merged["x_user"]) ** 2
            + (merged["y_ref"] - merged["y_user"]) ** 2
            + (merged["z_ref"] - merged["z_user"]) ** 2
        )
        dist_sum += float(merged["dist"].sum())
        dist_count += int(len(merged))

    mean_distance = float(dist_sum / max(dist_count, 1))
    similarity_score = max(0.0, min(100.0, 100 - mean_distance * 100))

    return {
        "similarity_score": round(similarity_score, 2),
        "mean_landmark_distance": round(mean_distance, 6),
        "frames_compared": len(common_frames),
        "motion_range_reference": [ref_start, ref_end],
        "motion_range_user": [user_start, user_end],
    }


def apply_acceptable_threshold(comparison, threshold_percent=ACCEPTABLE_SIMILARITY_PERCENT):
    """
    Add deviation and acceptability to the comparison dict. Uses the frame-by-frame
    similarity_score; optionally consider DTW similarity too. Below threshold,
    the user is encouraged to practice the sections with feedback.
    """
    score = comparison.get("similarity_score")
    if score is None:
        comparison["deviation_percent"] = None
        comparison["within_acceptable_range"] = None
        comparison["recommendation"] = "Could not compute similarity."
        return
    deviation = max(0.0, min(100.0, 100 - score))
    comparison["deviation_percent"] = round(deviation, 1)
    comparison["within_acceptable_range"] = score >= threshold_percent
    if comparison["within_acceptable_range"]:
        comparison["recommendation"] = (
            "Your movement is within the acceptable range. Review the feedback below for fine-tuning."
        )
    else:
        comparison["recommendation"] = (
            "Your movement differs from the reference. Practice the sections with feedback below to improve."
        )


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
        if any(p is None for p in (ref_shoulder, ref_wrist, user_shoulder, user_wrist)):
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
        if any(p is None for p in (ref_s, ref_e, ref_w, user_s, user_e, user_w)):
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
        elif ref_straight and user_angle < ref_angle - 10:
            # Reference has straight arm; user's arm is somewhat bent — suggest straightening
            feedback.append(
                f"At {user_ts}: Your {side_name.lower()} arm should be straighter; the reference has a straight arm at {ref_ts}."
            )

    # ----- Knee angle (left and right): bent vs straight, with explicit "user bent / reference not" -----
    for side_name, (hip_id, knee_id, ankle_id) in [("Left", (23, 25, 27)), ("Right", (24, 26, 28))]:
        ref_hip = _get_point(ref_df, ref_f, hip_id)
        ref_knee = _get_point(ref_df, ref_f, knee_id)
        ref_ankle = _get_point(ref_df, ref_f, ankle_id)
        user_hip = _get_point(user_df, user_f, hip_id)
        user_knee = _get_point(user_df, user_f, knee_id)
        user_ankle = _get_point(user_df, user_f, ankle_id)
        if any(p is None for p in (ref_hip, ref_knee, ref_ankle, user_hip, user_knee, user_ankle)):
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
    if all(p is not None for p in (ref_l_hip, ref_r_hip, ref_l_shoulder, ref_r_shoulder,
                                    user_l_hip, user_r_hip, user_l_shoulder, user_r_shoulder)):
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
        ref_straight_x = abs(ref_lean_x) < 0.02  # reference torso is straight (no left/right lean)
        if user_lean_x > ref_lean_x + thresh:
            if ref_straight_x:
                feedback.append(
                    f"At {user_ts}: Your torso is to the right while the reference's torso is straight at {ref_ts}."
                )
            else:
                feedback.append(
                    f"At {user_ts}: Your torso is leaning right compared to the reference at {ref_ts}."
                )
        elif user_lean_x < ref_lean_x - thresh:
            if ref_straight_x:
                feedback.append(
                    f"At {user_ts}: Your torso is to the left while the reference's torso is straight at {ref_ts}."
                )
            else:
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

        # ----- Core engagement: only when reference is actually crunching (torso lowered), not at start -----
        # Vertical torso span (y increases downward): smaller = torso lowered / crunching.
        ref_torso_vertical = ref_hip_mid[1] - ref_shoulder_mid[1]   # positive when hips below shoulders
        user_torso_vertical = user_hip_mid[1] - user_shoulder_mid[1]
        core_thresh = 0.05  # ref clearly more "crunched" than user
        # Skip at start (standing position) and only when ref is actually crunching (torso lowered).
        ref_is_crunching = ref_torso_vertical < REF_TORSO_CRUNCH_THRESHOLD
        past_start = ref_f > FEEDBACK_CORE_START_COOLDOWN_FRAMES
        if past_start and ref_is_crunching and ref_torso_vertical < user_torso_vertical - core_thresh:
            feedback.append(
                f"At {user_ts}: You are not engaging your core."
            )

    # ----- Arm symmetry: if reference has one arm up and one down, check user matches -----
    for (ref_left_w, ref_right_w, user_left_w, user_right_w) in [(
        _get_point(ref_df, ref_f, 15), _get_point(ref_df, ref_f, 16),
        _get_point(user_df, user_f, 15), _get_point(user_df, user_f, 16),
    )]:
        if any(p is None for p in (ref_left_w, ref_right_w, user_left_w, user_right_w)):
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


def run_feedback_analysis(ref_df, user_df, path, ref_fps=None, user_fps=None, sample_every=15):
    """
    Run per-frame feedback analysis along the DTW alignment path.
    path: list of (ref_idx, user_idx) from fastdtw (0-based indices into pose sequences).
    Trimmed dfs have frame numbers 1, 2, 3, ... so we use ref_idx+1, user_idx+1 as frame numbers.
    """
    ref_fps = ref_fps if ref_fps and ref_fps > 0 else DEFAULT_FPS
    user_fps = user_fps if user_fps and user_fps > 0 else DEFAULT_FPS
    entries = []
    for i in range(0, len(path), sample_every):
        ref_idx, user_idx = path[i]
        ref_idx, user_idx = int(ref_idx), int(user_idx)
        # Path indices are 0-based; trimmed dfs have frames 1, 2, 3, ...
        ref_frame = ref_idx + 1
        user_frame = user_idx + 1
        ref_time = _frame_to_timestamp_str(ref_frame, ref_fps)
        user_time = _frame_to_timestamp_str(user_frame, user_fps)
        fb = _analyze_frame(
            ref_df, user_df, ref_frame, user_frame,
            fps=user_fps, ref_time=ref_time, user_time=user_time
        )
        if fb:
            entries.append({
                "reference_time": ref_time,
                "user_time": user_time,
                "feedback": fb,
            })
    return entries


def _parse_timestamp(ts_str):
    """Parse '[m:s]' or '[mm:ss]' to total seconds. Returns float."""
    if not ts_str or not isinstance(ts_str, str):
        return 0.0
    m = re.match(r"\[(\d+):(\d{2})\]", ts_str.strip())
    if not m:
        return 0.0
    return int(m.group(1)) * 60 + int(m.group(2))


def _seconds_to_timestamp(sec, fps=DEFAULT_FPS):
    """Format seconds as [m:ss] for display."""
    sec = max(0, float(sec))
    m = int(sec // 60)
    s = int(sec % 60)
    return f"[{m}:{s:02d}]"


def _feedback_stem(fb_string):
    """
    Normalize a feedback string to a stem for grouping: remove leading 'At [m:s]: '
    and any ' at [m:s]' (or ' at [m:s].') so that the same feedback at different times groups together.
    """
    s = re.sub(r"^At\s*\[\d+:\d+\]:\s*", "", fb_string.strip(), count=1)
    s = re.sub(r"\s+at\s*\[\d+:\d+\]\.?\s*", " ", s, flags=re.IGNORECASE)
    return s.strip().rstrip(".")


def group_feedback_by_time_ranges(entries, max_gap_sec=1.5):
    """
    Group per-frame feedback into time ranges. Same feedback type in consecutive or
    nearby time samples becomes one comment for a duration, e.g. "Your left arm is
    not bent enough for [0:02]-[0:04]."
    entries: list of { reference_time, user_time, feedback: [str, ...] }
    max_gap_sec: merge ranges if gap between samples is at most this (seconds).
    Returns list of { user_time_range, reference_time_range, feedback } (one per grouped message).
    """
    # Flatten: (user_sec, ref_sec, stem) for each feedback line
    flat = []
    for e in entries:
        u_sec = _parse_timestamp(e.get("user_time"))
        r_sec = _parse_timestamp(e.get("reference_time"))
        for fb in e.get("feedback", []):
            stem = _feedback_stem(fb)
            if stem:
                flat.append((u_sec, r_sec, stem))

    # Group by stem
    by_stem = {}
    for u_sec, r_sec, stem in flat:
        by_stem.setdefault(stem, []).append((u_sec, r_sec))

    # Merge into ranges per stem: sort by user_sec, then merge if gap <= max_gap_sec
    result = []
    for stem, points in by_stem.items():
        points = sorted(set(points))
        if not points:
            continue
        ranges = []  # (u_start, u_end, r_min, r_max)
        u_start, u_end = points[0][0], points[0][0]
        r_min, r_max = points[0][1], points[0][1]
        for u_sec, r_sec in points:
            if u_sec - u_end <= max_gap_sec:
                u_end = u_sec
                r_max = max(r_max, r_sec)
                r_min = min(r_min, r_sec)
            else:
                ranges.append((u_start, u_end, r_min, r_max))
                u_start, u_end = u_sec, u_sec
                r_min, r_max = r_sec, r_sec
        ranges.append((u_start, u_end, r_min, r_max))

        for u_start, u_end, r_mn, r_mx in ranges:
            if u_start == u_end:
                user_range = _seconds_to_timestamp(u_start)
                ref_range = _seconds_to_timestamp(r_mn)
            else:
                user_range = f"{_seconds_to_timestamp(u_start)}–{_seconds_to_timestamp(u_end)}"
                ref_range = f"{_seconds_to_timestamp(r_mn)}–{_seconds_to_timestamp(r_mx)}"
            result.append({
                "user_time_range": user_range,
                "reference_time_range": ref_range,
                "feedback": f"{stem} for {user_range}.",
            })
    return result


def feedback_analysis_to_paragraph(feedback_analysis):
    """
    Turn grouped feedback (list of { user_time_range, reference_time_range, feedback })
    into a single, user-friendly paragraph. Uses plain time ranges (e.g. "from 0:02 to 0:04")
    and flows each point into a readable sentence.
    """
    if not feedback_analysis or not isinstance(feedback_analysis, list):
        return "No specific feedback for this comparison."

    def range_to_phrase(tr):
        """Convert '[0:02]' or '[0:02]–[0:04]' to 'at 0:02' or 'from 0:02 to 0:04'."""
        if not tr:
            return ""
        tr = str(tr).strip()
        single = re.match(r"\[(\d+):(\d{2})\]$", tr)
        if single:
            return f"at {single.group(1)}:{single.group(2)}"
        dash = re.match(r"\[(\d+):(\d{2})\]\s*[–\-]\s*\[(\d+):(\d{2})\]", tr)
        if dash:
            return f"from {dash.group(1)}:{dash.group(2)} to {dash.group(3)}:{dash.group(4)}"
        return tr

    sentences = []
    for entry in feedback_analysis:
        u_range = entry.get("user_time_range", "")
        fb = entry.get("feedback", "")
        # Remove trailing " for [x]–[y]." or " for [x]." so we don't duplicate the time in the sentence
        stem = re.sub(r"\s+for\s+\[\d+:\d+\](?:[–\-]\[\d+:\d+\])?\.?\s*$", "", fb).strip().rstrip(".")
        if not stem:
            stem = fb
        time_phrase = range_to_phrase(u_range)
        if time_phrase:
            # "Between 0:02 and 0:04, your left arm was too low compared to the reference."
            first = stem[0].lower() if stem else ""
            rest = stem[1:] if len(stem) > 1 else ""
            sentences.append(f"{time_phrase.capitalize()}, {first}{rest}.")
        else:
            sentences.append(stem + "." if not stem.endswith(".") else stem)

    if not sentences:
        return "No specific feedback for this comparison."
    return " ".join(sentences)


def _format_time_range_for_tip(user_time_range):
    """Convert '[0:02]' or '[0:02]–[0:04]' to 'at 0:02' or 'from 0:02 to 0:04' for tips."""
    if not user_time_range or not isinstance(user_time_range, str):
        return ""
    s = user_time_range.strip()
    single = re.match(r"\[(\d+):(\d{2})\]$", s)
    if single:
        return f"at {single.group(1)}:{single.group(2)}"
    dash = re.match(r"\[(\d+):(\d{2})\]\s*[–\-]\s*\[(\d+):(\d{2})\]", s)
    if dash:
        return f"from {dash.group(1)}:{dash.group(2)} to {dash.group(3)}:{dash.group(4)}"
    return s


def _feedback_stem_to_tip(stem, user_time_range):
    """
    Convert a feedback stem (log-style) into a clear 1-3 sentence tip for the user.
    Returns (tip_text, merge_info). merge_info is None or (limb_type, action, side) for
    arm/leg tips that can be merged when both left and right appear at the same timestamp.
    """
    t = _format_time_range_for_tip(user_time_range)
    time_phrase = f" {t}." if t else "."
    stem_lower = (stem or "").lower()

    # Arm too low / reference has arm higher
    if "arm is too low" in stem_lower or "arm higher" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Keep your {side} arm higher{time_phrase}", ("arm", "higher", side))
    # Arm too high / reference has arm lower
    if "arm is too high" in stem_lower or "arm lower" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Lower your {side} arm{time_phrase}", ("arm", "lower", side))
    # Arm more bent than reference
    if "arm is more bent" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Straighten your {side} arm{time_phrase}", ("arm", "straighten", side))
    # Arm straighter than reference
    if "arm is straighter" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Keep your {side} arm bent{time_phrase}", ("arm", "bent", side))
    # Arm should be straighter; reference has straight arm
    if "arm should be straighter" in stem_lower or ("straight arm" in stem_lower and "straighter" in stem_lower):
        side = "left" if "left" in stem_lower else "right"
        return (f"Keep your {side} arm straighter{time_phrase}", ("arm", "straighter", side))

    # Leg bent while reference straight
    if "leg is bent" in stem_lower and "reference" in stem_lower and "straight" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Straighten your {side} leg{time_phrase}", ("leg", "leg_straight", side))
    # Leg straight while reference bent
    if "leg is straight" in stem_lower and "reference" in stem_lower and "bent" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Bend your {side} leg{time_phrase}", ("leg", "leg_bent", side))
    # Knee too bent
    if "knee is too bent" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Straighten your {side} knee a little{time_phrase}", ("leg", "knee_straight", side))
    # Knee too straight
    if "knee is too straight" in stem_lower:
        side = "left" if "left" in stem_lower else "right"
        return (f"Lift your {side} leg higher or bend your {side} knee more{time_phrase}", ("leg", "knee_bent", side))

    # Torso to the left/right while reference is straight -> straighten body
    if "torso is to the right" in stem_lower and "reference's torso is straight" in stem_lower:
        return (f"Straighten your body{time_phrase}", None)
    if "torso is to the left" in stem_lower and "reference's torso is straight" in stem_lower:
        return (f"Straighten your body{time_phrase}", None)
    # Torso lean (no merge)
    if "torso is leaning right" in stem_lower:
        return (f"Lean your torso slightly left{time_phrase}", None)
    if "torso is leaning left" in stem_lower:
        return (f"Lean your torso slightly right{time_phrase}", None)
    if "torso is leaning forward" in stem_lower:
        return (f"Lean your torso forward{time_phrase}", None)
    if "torso is leaning back" in stem_lower:
        return (f"Lean your torso back{time_phrase}", None)

    # Core engagement (no merge)
    if "not engaging your core" in stem_lower or "engaging your core" in stem_lower:
        return (f"Crunch your core{time_phrase}", None)

    # Arm symmetry: reference has left/right arm raised (no merge for single-arm raise)
    if "reference has left arm raised" in stem_lower or "left arm raised" in stem_lower:
        return (f"Raise your left arm to match the reference{time_phrase}", None)
    if "reference has right arm raised" in stem_lower or "right arm raised" in stem_lower:
        return (f"Raise your right arm to match the reference{time_phrase}", None)
    if "arms are not in the same pose" in stem_lower:
        return (f"Match the reference arm pose (one arm up, one down){time_phrase}", None)

    # Timing (no merge)
    if "moving too slow" in stem_lower or "falling behind" in stem_lower:
        return (f"Speed up to match the reference{time_phrase}", None)
    if "moving too fast" in stem_lower or "ahead of the reference" in stem_lower:
        return (f"Slow down to match the reference{time_phrase}", None)

    # Fallback
    return (f"Match the reference pose{time_phrase}".strip(), None)


# Merged tip text when both left and right match at same timestamp (limb_type, action) -> tip base
_MERGED_TIP_TEXT = {
    ("arm", "higher"): "Keep your arms higher",
    ("arm", "lower"): "Lower your arms",
    ("arm", "straighten"): "Straighten your arms",
    ("arm", "straighter"): "Keep your arms straighter",
    ("arm", "bent"): "Keep your arms bent",
    ("leg", "leg_straight"): "Straighten your legs",
    ("leg", "leg_bent"): "Bend your legs",
    ("leg", "knee_straight"): "Straighten your knees a little",
    ("leg", "knee_bent"): "Lift your legs higher or bend your knees more",
}


def get_practice_tips_sentences(comparison):
    """
    Build a list of clean, frontend-ready tip sentences from feedback_analysis.
    When both left and right arm (or leg) need the same fix at the same timestamp,
    returns one sentence with "arms" or "legs" instead of two. Each sentence is
    one short, actionable tip (e.g. "Keep your arms higher at 0:02.").
    """
    feedback_analysis = comparison.get("feedback_analysis") or []
    if not isinstance(feedback_analysis, list):
        feedback_analysis = []

    raw_tips = []
    for entry in feedback_analysis:
        user_range = entry.get("user_time_range", "")
        fb = entry.get("feedback", "")
        stem = re.sub(r"\s+for\s+\[\d+:\d+\](?:[–\-]\[\d+:\d+\])?\.?\s*$", "", fb).strip().rstrip(".")
        if not stem:
            continue
        tip, merge_info = _feedback_stem_to_tip(stem, user_range)
        if not tip:
            continue
        raw_tips.append((user_range, tip, merge_info))

    time_phrase_by_range = {user_range: _format_time_range_for_tip(user_range) for user_range, _, _ in raw_tips}
    group_sides = {}
    group_tips = {}
    non_merge_tips = []
    for user_range, tip, merge_info in raw_tips:
        if merge_info is None:
            non_merge_tips.append(tip)
            continue
        limb_type, action, side = merge_info
        key = (user_range, limb_type, action)
        group_sides.setdefault(key, set()).add(side)
        group_tips.setdefault(key, []).append(tip)

    final_tips = []
    for (user_range, limb_type, action), sides in group_sides.items():
        if sides >= {"left", "right"}:
            base = _MERGED_TIP_TEXT.get((limb_type, action), f"Adjust your {limb_type}s")
            t = time_phrase_by_range.get(user_range, _format_time_range_for_tip(user_range))
            time_phrase = f" {t}." if t else "."
            final_tips.append(f"{base}{time_phrase}")
        else:
            for tip in group_tips.get((user_range, limb_type, action), []):
                final_tips.append(tip)
    final_tips.extend(non_merge_tips)

    seen = set()
    unique = []
    for tip in final_tips:
        s = tip.strip()
        if not s:
            continue
        if s not in seen:
            seen.add(s)
            unique.append(s if s.endswith(".") else s + ".")
    return unique


def write_tips_file(comparison, tips_path=None):
    """
    Write a tips file to disk and return its path. Uses the same clean sentences
    as get_practice_tips_sentences (arms/legs merged when both sides at same time).
    """
    if tips_path is None:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        tips_path = os.path.join(TIPS_FOLDER, f"tips_{timestamp}.txt")
    unique_tips = get_practice_tips_sentences(comparison)

    tips_lines = [
        "DANCE PRACTICE TIPS",
        "=" * 40,
        "",
        "Use these tips to improve your next run. Each tip corresponds to a moment in your performance.",
        "",
    ]
    for tip in unique_tips:
        tips_lines.append(f"• {tip}")
        tips_lines.append("")

    if not unique_tips:
        tips_lines.append("No specific tips for this run. Keep practicing!")
        tips_lines.append("")

    with open(tips_path, "w", encoding="utf-8") as f:
        f.write("\n".join(tips_lines))
    return tips_path


def build_negative_feedback_summary(comparison):
    """
    One short, readable paragraph: where to improve (no long repetition of every feedback line).
    Points to deviation screenshots below.
    """
    summary = comparison.get("feedback_summary_paragraph") or ""
    if not summary or summary.startswith("No specific feedback"):
        return "Focus on matching the reference pose and timing. See deviation screenshots below for the moments that differed most."
    # Keep it concise: first sentence or two, then point to screenshots
    sentences = [s.strip() for s in summary.replace(". ", ".\n").split("\n") if s.strip()]
    if not sentences:
        return "See deviation screenshots below for where you differed most from the reference."
    intro = sentences[0]
    if len(sentences) > 1:
        intro = intro + " " + sentences[1] if len(intro) < 120 else intro
    return intro.rstrip(".") + ". See deviation screenshots below."


def build_positive_feedback_summary(comparison):
    """
    One short paragraph: where the user's pose was most identical to the reference
    (best pose match, not timing). Points to pose-match screenshots below.
    """
    best = comparison.get("best_pose_matches") or []
    if not best:
        return "See pose-match screenshots below for frames where your pose was most identical to the reference."
    times = [m.get("user_time", "") for m in best if m.get("user_time")]
    if not times:
        return "Your pose matched the reference most closely in several frames. See pose-match screenshots below."
    if len(times) == 1:
        return f"Your pose was most identical to the reference {times[0]}. See pose-match screenshots below."
    return f"Your pose was most identical to the reference at {', '.join(times)}. See pose-match screenshots below."


def normalize_pose_vector(vec):
    """
    Make pose comparison translation- and scale-invariant: center on hip midpoint,
    then scale so torso length (shoulder center to hip center) is 1. So we compare
    pose shape, not where the person stands in the frame or camera distance.
    """
    vec = np.asarray(vec, dtype=float).reshape(-1, 3).copy()
    if vec.size == 0:
        return vec.flatten()

    hip_left = vec[HIP_LEFT_VEC_IDX // 3]
    hip_right = vec[HIP_RIGHT_VEC_IDX // 3]
    hip_center = (hip_left + hip_right) * 0.5
    vec -= hip_center

    shoulder_left = vec[SHOULDER_LEFT_VEC_IDX // 3]
    shoulder_right = vec[SHOULDER_RIGHT_VEC_IDX // 3]
    shoulder_center = (shoulder_left + shoulder_right) * 0.5
    scale = np.linalg.norm(shoulder_center)
    if scale > 1e-6:
        vec /= scale
    return vec.flatten()


def build_pose_sequence(df, normalize=True):
    """
    Build a time-ordered sequence of pose vectors from a motion CSV for DTW.
    Each frame becomes one vector: for IMPORTANT_LANDMARKS we concatenate (x, y, z)
    in a fixed order. Missing landmarks are filled with (0, 0, 0).
    If normalize=True (default), each pose is centered on the hip and scaled by
    torso length so comparison is by pose shape, not position in frame.
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

        arr = np.array(pose_vector, dtype=float)
        if normalize:
            arr = normalize_pose_vector(arr)
        sequence.append(arr)

    return sequence


def compare_motion_csvs_dtw(reference_csv_path, user_csv_path, fps=DEFAULT_FPS, ref_fps=None, user_fps=None, path_sample_step=20):
    """
    Compare two motion CSVs using Dynamic Time Warping (DTW).
    ref_fps / user_fps: actual FPS of each video so timestamps match real duration (e.g. 15 s video shows 0:00–0:15).
    """
    if not _DTW_AVAILABLE:
        return {
            "dtw_distance": None,
            "dtw_similarity_score": None,
            "aligned_moments": [],
            "feedback_analysis": [],
            "feedback_summary_paragraph": "DTW was not run. Install fastdtw and scipy to get detailed feedback.",
            "worst_deviations": [],
            "best_pose_matches": [],
            "path_sample_start": [],
            "path_sample_end": [],
            "message": "DTW skipped: install fastdtw and scipy (pip install fastdtw scipy).",
        }

    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    # Trim to active motion range (skip standing still at start/end)
    ref_start, ref_end = detect_motion_range(ref_df)
    user_start, user_end = detect_motion_range(user_df)
    ref_df = trim_df_to_active_range(ref_df, ref_start, ref_end)
    user_df = trim_df_to_active_range(user_df, user_start, user_end)

    ref_sequence = build_pose_sequence(ref_df)
    user_sequence = build_pose_sequence(user_df)

    if not ref_sequence or not user_sequence:
        return {
            "dtw_distance": None,
            "dtw_similarity_score": None,
            "aligned_moments": [],
            "feedback_analysis": [],
            "feedback_summary_paragraph": "Could not compare: one or both videos had no pose data.",
            "worst_deviations": [],
            "best_pose_matches": [],
            "path_sample_start": [],
            "path_sample_end": [],
            "message": "One or both CSVs had no frames with pose data.",
        }

    # Run FastDTW: distance = total cost of the best alignment; path = list of (ref_idx, user_idx)
    distance, path = fastdtw(ref_sequence, user_sequence, dist=euclidean)

    ref_fps_used = ref_fps if ref_fps and ref_fps > 0 else fps
    user_fps_used = user_fps if user_fps and user_fps > 0 else fps

    def frame_to_ts(frame_1based, use_fps):
        sec = (frame_1based - 1) / max(float(use_fps), 1e-6)
        m, s = int(sec // 60), int(sec % 60)
        return f"[{m}:{s:02d}]"

    # Per-pair distances for entire path
    # Track top-N moments without storing all per-path distances in memory.
    worst_heap = []  # min-heap by distance; keeps largest N
    best_heap = []   # max-heap via -distance; keeps smallest N under match threshold
    for i, (ri, ui) in enumerate(path):
        d = float(euclidean(ref_sequence[ri], user_sequence[ui]))
        if len(worst_heap) < NUM_DEVIATION_SCREENSHOTS:
            heapq.heappush(worst_heap, (d, i, int(ri), int(ui)))
        elif d > worst_heap[0][0]:
            heapq.heapreplace(worst_heap, (d, i, int(ri), int(ui)))

        if d <= POSE_MATCH_MAX_DISTANCE:
            if len(best_heap) < NUM_POSE_MATCH_SCREENSHOTS:
                heapq.heappush(best_heap, (-d, i, int(ri), int(ui)))
            elif d < -best_heap[0][0]:
                heapq.heapreplace(best_heap, (-d, i, int(ri), int(ui)))

    sorted_worst = sorted(worst_heap, key=lambda x: x[0], reverse=True)
    sorted_best = sorted([(-d, i, ri, ui) for (d, i, ri, ui) in best_heap], key=lambda x: x[0])

    worst_deviations = [
        {
            "ref_frame": ref_start + ri,
            "user_frame": user_start + ui,
            "distance": round(d, 4),
            "user_time": frame_to_ts(user_start + ui, user_fps_used),
        }
        for (d, _, ri, ui) in sorted_worst
    ]
    best_pose_matches = [
        {
            "ref_frame": ref_start + ri,
            "user_frame": user_start + ui,
            "distance": round(d, 4),
            "user_time": frame_to_ts(user_start + ui, user_fps_used),
        }
        for (d, _, ri, ui) in sorted_best
    ]

    # Backward compat: single worst frame for existing screenshot logic
    worst_ref_frame_original = worst_deviations[0]["ref_frame"] if worst_deviations else None
    worst_user_frame_original = worst_deviations[0]["user_frame"] if worst_deviations else None

    path_len = max(len(path), 1)
    normalized_distance = distance / path_len
    dtw_similarity_score = max(0.0, min(100.0, 100 - normalized_distance * 50))

    def frame_to_timestamp(frame_idx, use_fps):
        seconds = frame_idx / use_fps
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"[{minutes}:{secs:02d}]"

    aligned_moments = []
    for i in range(0, len(path), path_sample_step):
        ref_idx, user_idx = path[i]
        # Path is 0-based; timestamps use 1-based frame (first active frame = 1)
        aligned_moments.append({
            "reference_time": frame_to_timestamp(ref_idx + 1, ref_fps_used),
            "user_time": frame_to_timestamp(user_idx + 1, user_fps_used),
        })

    # First and last 10 path steps for DTW sync verification (ref time <-> user time)
    path_sample_start = []
    path_sample_end = []
    for idx in range(min(10, len(path))):
        ri, ui = path[idx]
        path_sample_start.append({
            "reference_time": frame_to_timestamp(ri + 1, ref_fps_used),
            "user_time": frame_to_timestamp(ui + 1, user_fps_used),
            "ref_idx": int(ri),
            "user_idx": int(ui),
        })
    for idx in range(max(0, len(path) - 10), len(path)):
        ri, ui = path[idx]
        path_sample_end.append({
            "reference_time": frame_to_timestamp(ri + 1, ref_fps_used),
            "user_time": frame_to_timestamp(ui + 1, user_fps_used),
            "ref_idx": int(ri),
            "user_idx": int(ui),
        })

    feedback_analysis = run_feedback_analysis(
        ref_df, user_df, path, ref_fps=ref_fps_used, user_fps=user_fps_used, sample_every=15
    )
    # Group into time ranges so one message covers a duration, e.g. "arm not bent for [0:02]–[0:04]"
    feedback_analysis = group_feedback_by_time_ranges(feedback_analysis, max_gap_sec=1.5)
    feedback_summary_paragraph = feedback_analysis_to_paragraph(feedback_analysis)

    return {
        "dtw_distance": round(distance, 4),
        "dtw_normalized_distance": round(normalized_distance, 6),
        "dtw_similarity_score": round(dtw_similarity_score, 2),
        "path_length": len(path),
        "ref_sequence_length": len(ref_sequence),
        "user_sequence_length": len(user_sequence),
        "aligned_moments": aligned_moments,
        "feedback_analysis": feedback_analysis,
        "feedback_summary_paragraph": feedback_summary_paragraph,
        "motion_range_reference": [ref_start, ref_end],
        "motion_range_user": [user_start, user_end],
        "worst_deviation_ref_frame": worst_ref_frame_original,
        "worst_deviation_user_frame": worst_user_frame_original,
        "worst_deviations": worst_deviations,
        "best_pose_matches": best_pose_matches,
        "path_sample_start": path_sample_start,
        "path_sample_end": path_sample_end,
    }


def write_result_log(video1_path, video2_path, output1, output2, comparison, video_info=None, tips_file_path=None):
    """
    Write a timestamped log file for this run with paths and comparison result.
    One log file is created per run in LOG_FOLDER (e.g. logs/motion_capture_2026-02-12_16-30-45.log).
    All feedback is in timestamp form [minutes:seconds]; video_info (frame count, FPS, duration) is optional.
    If tips_file_path is provided, it is noted in the log.
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
    ]
    if tips_file_path:
        lines.extend(["Tips file (clean practice tips):", f"  {tips_file_path}", ""])
    if video_info:
        ref_vi = video_info.get("reference")
        user_vi = video_info.get("user")
        if ref_vi or user_vi:
            lines.append("Video info (original file):")
            if ref_vi:
                lines.append(
                    f"  Reference: {ref_vi.get('frame_count', '?')} frames, "
                    f"{ref_vi.get('fps', '?')} FPS, "
                    f"duration {ref_vi.get('duration_sec', '?')} s"
                )
            if user_vi:
                lines.append(
                    f"  User:      {user_vi.get('frame_count', '?')} frames, "
                    f"{user_vi.get('fps', '?')} FPS, "
                    f"duration {user_vi.get('duration_sec', '?')} s"
                )
            lines.append("")
    lines.extend([
        "Output CSVs:",
        f"  Reference motion: {output1}",
        f"  User motion:      {output2}",
        "",
    ])
    if comparison.get("motion_fps"):
        mf = comparison["motion_fps"]
        lines.append(
            f"  Timestamps: frame N = N/FPS seconds (reference FPS: {mf.get('reference', '?')}, user FPS: {mf.get('user', '?')})."
        )
        lines.append("")
    if comparison.get("motion_range_reference") or comparison.get("motion_range_user"):
        lines.append("Active motion range (standing-still trimmed):")
        if comparison.get("motion_range_reference"):
            r = comparison["motion_range_reference"]
            lines.append(f"  Reference: frames {r[0]}–{r[1]}")
        if comparison.get("motion_range_user"):
            u = comparison["motion_range_user"]
            lines.append(f"  User:      frames {u[0]}–{u[1]}")
        lines.append("")
    lines.extend([
        "Comparison (frame-by-frame):",
        f"  Similarity score (0-100):  {comparison.get('similarity_score', 'N/A')}",
        f"  Deviation from reference:  {comparison.get('deviation_percent', 'N/A')}%",
        f"  Within acceptable range:   {comparison.get('within_acceptable_range', 'N/A')} (threshold: {ACCEPTABLE_SIMILARITY_PERCENT}%)",
        f"  Mean landmark distance:   {comparison.get('mean_landmark_distance', 'N/A')}",
        f"  Frames compared:          {comparison.get('frames_compared', 'N/A')}",
        "",
        "Recommendation:",
        f"  {comparison.get('recommendation', 'N/A')}",
    ])
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
            f"  Reference sequence (frames): {comparison.get('ref_sequence_length', 'N/A')}",
            f"  User sequence (frames):      {comparison.get('user_sequence_length', 'N/A')}",
            "",
            "  DTW sync verification: the path maps each step to (ref_frame, user_frame) so",
            "  reference and user are aligned by pose, not by time.",
        ])
        if comparison.get("path_sample_start"):
            lines.append("  First 10 alignments (ref_time <-> user_time):")
            for p in comparison["path_sample_start"]:
                lines.append(f"    {p.get('reference_time', '')} <-> {p.get('user_time', '')}")
        if comparison.get("path_sample_end"):
            lines.append("  Last 10 alignments (ref_time <-> user_time):")
            for p in comparison["path_sample_end"]:
                lines.append(f"    {p.get('reference_time', '')} <-> {p.get('user_time', '')}")
    if comparison.get("dtw_message"):
        lines.append(f"  DTW message: {comparison['dtw_message']}")
    def wrap_paragraph(text, indent="  ", width=70):
        words = (text or "").split()
        current, out = [], []
        for w in words:
            current.append(w)
            if len(indent + " ".join(current)) > width and len(current) > 1:
                out.append(indent + " ".join(current[:-1]))
                current = [w]
        if current:
            out.append(indent + " ".join(current))
        return out

    if comparison.get("negative_feedback_summary"):
        lines.append("")
        lines.append("Negative feedback (where to improve):")
        lines.extend(wrap_paragraph(comparison["negative_feedback_summary"]))
    if comparison.get("positive_feedback_summary"):
        lines.append("")
        lines.append("Positive feedback (where your pose was most identical to the reference):")
        lines.extend(wrap_paragraph(comparison["positive_feedback_summary"]))
    dev_imgs = comparison.get("deviation_comparison_images") or []
    if dev_imgs:
        lines.append("")
        lines.append("Deviation comparison images (side-by-side, red = not matching choreographer):")
        for i, p in enumerate(dev_imgs, 1):
            lines.append(f"  #{i}: {p}")
    pose_imgs = comparison.get("pose_match_comparison_images") or []
    if pose_imgs:
        lines.append("")
        lines.append("Pose-match comparison images (side-by-side, green = matching choreographer):")
        for i, p in enumerate(pose_imgs, 1):
            lines.append(f"  #{i}: {p}")
    if comparison.get("aligned_moments") and isinstance(comparison["aligned_moments"], list):
        lines.append("")
        lines.append("Aligned moments (timestamps [min:sec], reference <-> user), sampled every 20 matches:")
        for m in comparison["aligned_moments"]:
            lines.append(f"  Reference {m['reference_time']} <-> User {m['user_time']}")
    # Summary paragraph: easy-to-read feedback for the user
    if comparison.get("feedback_summary_paragraph"):
        lines.append("")
        lines.append("Feedback summary (paragraph):")
        lines.append("")
        summary = comparison["feedback_summary_paragraph"]
        # Word-wrap at ~70 chars for readability
        words = summary.split()
        current = []
        for w in words:
            current.append(w)
            if len(" ".join(current)) > 70 and len(current) > 1:
                lines.append("  " + " ".join(current[:-1]))
                current = [w]
        if current:
            lines.append("  " + " ".join(current))
        lines.append("")
    # In-depth feedback: grouped by time range (e.g. "for [0:02]–[0:04]")
    if comparison.get("feedback_analysis") and isinstance(comparison["feedback_analysis"], list):
        lines.append("Feedback by time range (where you differ from reference):")
        for entry in comparison["feedback_analysis"]:
            u_range = entry.get("user_time_range", entry.get("user_time", ""))
            r_range = entry.get("reference_time_range", entry.get("reference_time", ""))
            fb = entry.get("feedback")
            if isinstance(fb, list):
                for line in fb:
                    lines.append(f"  User {u_range} (ref {r_range}): {line}")
            else:
                lines.append(f"  User {u_range} (ref {r_range}): {fb}")
    lines.extend(["", "Full comparison (JSON):", json.dumps(comparison, indent=2, default=str), "", "=" * 60])

    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return log_path


def _run_analysis(video1_path, video2_path, run_ts):
    """
    Run full motion capture pipeline: extract motion, compare, generate tips/log/screenshots,
    optionally upload to storage. Returns response dict (no jsonify).
    """
    output1 = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
    output2 = os.path.join(OUTPUT_FOLDER, "user_motion.csv")

    video_info = {
        "reference": get_video_info(video1_path),
        "user": get_video_info(video2_path),
    }

    # Run pose extraction (each returns effective FPS for that CSV so timestamps match real time)
    ref_motion_fps = extract_motion_from_video(video1_path, output1)
    user_motion_fps = extract_motion_from_video(video2_path, output2)

    comparison = compare_motion_csvs(output1, output2)
    dtw_result = compare_motion_csvs_dtw(
        output1, output2, ref_fps=ref_motion_fps, user_fps=user_motion_fps
    )
    comparison["dtw_message"] = dtw_result.pop("message", None)
    comparison.update(dtw_result)
    comparison["motion_fps"] = {"reference": ref_motion_fps, "user": user_motion_fps}

    # Two readable summaries (negative = where to improve, positive = most identical pose)
    comparison["negative_feedback_summary"] = build_negative_feedback_summary(comparison)
    comparison["positive_feedback_summary"] = build_positive_feedback_summary(comparison)

    # Practice tips (used below for comparison images and in response)
    comparison["practice_tips"] = get_practice_tips_sentences(comparison)

    # Side-by-side deviation images: one per worst-deviation moment; user's wrong landmarks in red; tips at bottom
    comparison["deviation_comparison_images"] = []
    tips_for_image = comparison.get("practice_tips") or []
    for idx, moment in enumerate(comparison.get("worst_deviations") or []):
        ref_f = moment.get("ref_frame")
        user_f = moment.get("user_frame")
        if ref_f is None or user_f is None:
            continue
        img_path = os.path.join(
            DEVIATION_SCREENSHOTS_FOLDER, f"deviation_comparison_{idx + 1}_{run_ts}.png"
        )
        try:
            if save_deviation_comparison_image(
                video1_path,
                video2_path,
                ref_f,
                user_f,
                ref_motion_fps,
                user_motion_fps,
                img_path,
                tips_list=tips_for_image,
            ):
                comparison["deviation_comparison_images"].append(img_path)
        except Exception:
            pass
    comparison["deviation_comparison_image"] = (comparison["deviation_comparison_images"] or [None])[0]

    # Side-by-side pose-match images: one per best pose-match moment; green = matching choreographer; same format + tips
    comparison["pose_match_comparison_images"] = []
    pose_match_label = "You. Green line means the body part is matching the choreographer."
    for idx, moment in enumerate(comparison.get("best_pose_matches") or []):
        ref_f = moment.get("ref_frame")
        user_f = moment.get("user_frame")
        if ref_f is None or user_f is None:
            continue
        img_path = os.path.join(
            POSE_MATCH_SCREENSHOTS_FOLDER, f"pose_match_comparison_{idx + 1}_{run_ts}.png"
        )
        try:
            if save_deviation_comparison_image(
                video1_path,
                video2_path,
                ref_f,
                user_f,
                ref_motion_fps,
                user_motion_fps,
                img_path,
                tips_list=tips_for_image,
                user_label=pose_match_label,
                landmark_match_thresh=0.04,
            ):
                comparison["pose_match_comparison_images"].append(img_path)
        except Exception:
            pass
    comparison["pose_match_comparison_image"] = (comparison["pose_match_comparison_images"] or [None])[0]

    apply_acceptable_threshold(comparison)

    tips_path = write_tips_file(comparison)
    log_path = write_result_log(video1_path, video2_path, output1, output2, comparison, video_info=video_info, tips_file_path=tips_path)

    # Build response; then upload generated files to storage and add URLs when configured
    response = {
        "message": "Motion capture completed",
        "outputs": {
            "reference": output1,
            "user": output2
        },
        "video_info": video_info,
        "comparison": comparison,
        "log_file": log_path,
        "tips_file": tips_path,
        "deviation_comparison_image": comparison.get("deviation_comparison_image"),
        "deviation_comparison_images": comparison.get("deviation_comparison_images", []),
        "pose_match_comparison_image": comparison.get("pose_match_comparison_image"),
        "pose_match_comparison_images": comparison.get("pose_match_comparison_images", []),
    }
    run_prefix = f"runs/{run_ts}"
    if log_path:
        u = _upload_file_to_storage(log_path, f"{run_prefix}/logs/{os.path.basename(log_path)}")
        if u:
            response["log_file_url"] = u
    if tips_path:
        u = _upload_file_to_storage(tips_path, f"{run_prefix}/tips/{os.path.basename(tips_path)}")
        if u:
            response["tips_file_url"] = u
    for path in response.get("deviation_comparison_images") or []:
        u = _upload_file_to_storage(path, f"{run_prefix}/screenshots/deviation/{os.path.basename(path)}")
        if u:
            response.setdefault("deviation_comparison_image_urls", []).append(u)
    for path in response.get("pose_match_comparison_images") or []:
        u = _upload_file_to_storage(path, f"{run_prefix}/screenshots/pose_match/{os.path.basename(path)}")
        if u:
            response.setdefault("pose_match_comparison_image_urls", []).append(u)

    return response

@app.route("/")
def home():
    return {
        "status": "DancePerfect API running",
        "endpoints": ["/upload-videos", "/analyze", "/check-dtw"]
    }


@app.route("/upload-videos", methods=["POST"])
def upload_videos():
    """
    POST two videos as 'video1' (reference) and 'video2' (user). Saves to backend, runs analysis,
    returns comparison and (when configured) storage URLs for log, tips, and screenshots.
    """
    if "video1" not in request.files or "video2" not in request.files:
        return jsonify({"error": "Two videos are required"}), 400
    video1 = request.files["video1"]
    video2 = request.files["video2"]
    video1_path = os.path.join(UPLOAD_FOLDER, "dance_reference.mp4")
    video2_path = os.path.join(UPLOAD_FOLDER, "dance_user.mp4")
    video1.save(video1_path)
    video2.save(video2_path)
    run_ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return jsonify(_run_analysis(video1_path, video2_path, run_ts))


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    POST two videos as 'choreo_video' (reference) and 'dancer_video' (user). Used by the website
    frontend. Saves to backend for processing, runs analysis, returns comparison and (when
    configured) storage URLs for log, tips, and screenshots.
    """
    if "choreo_video" not in request.files or "dancer_video" not in request.files:
        return jsonify({"error": "Both choreographer and dancer videos are required"}), 400
    choreo = request.files["choreo_video"]
    dancer = request.files["dancer_video"]
    video1_path = os.path.join(UPLOAD_FOLDER, "dance_reference.mp4")
    video2_path = os.path.join(UPLOAD_FOLDER, "dance_user.mp4")
    choreo.save(video1_path)
    dancer.save(video2_path)
    run_ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return jsonify(_run_analysis(video1_path, video2_path, run_ts))


@app.route("/check-dtw", methods=["GET"])
def check_dtw():
    """
    Verify that DTW is working and syncing the two motion sequences.
    Uses the last-generated motion CSVs (from POST /upload-videos). Returns alignment
    diagnostics: sequence lengths, path length, and first/last 10 (ref_time, user_time) pairs.
    """
    output1 = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
    output2 = os.path.join(OUTPUT_FOLDER, "user_motion.csv")
    if not os.path.isfile(output1) or not os.path.isfile(output2):
        return jsonify({
            "dtw_available": _DTW_AVAILABLE,
            "error": "No motion CSVs found. Upload two videos first via POST /upload-videos.",
        }), 404

    result = compare_motion_csvs_dtw(output1, output2, ref_fps=DEFAULT_FPS, user_fps=DEFAULT_FPS)
    dtw_ran = result.get("dtw_distance") is not None

    payload = {
        "dtw_available": _DTW_AVAILABLE,
        "dtw_ran": dtw_ran,
        "ref_sequence_length": result.get("ref_sequence_length"),
        "user_sequence_length": result.get("user_sequence_length"),
        "path_length": result.get("path_length"),
        "path_sample_start": result.get("path_sample_start", []),
        "path_sample_end": result.get("path_sample_end", []),
        "dtw_similarity_score": result.get("dtw_similarity_score"),
        "message": (
            "DTW is syncing: each path step pairs a reference pose with a user pose (by similarity), "
            "so ref_time and user_time can differ. Check path_sample_start/end to see the alignment."
            if dtw_ran
            else (result.get("message") or "DTW did not run.")
        ),
    }
    return jsonify(payload)


if __name__ == "__main__":
    # When this file is run directly (python testing.py), start the Flask dev server.
    # debug=True is convenient for development (auto-reload and detailed error pages),
    # but you would typically disable it in production.
    app.run(host="0.0.0.0", port=5000, debug=True)
