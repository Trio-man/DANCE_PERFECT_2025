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
import subprocess 
import uuid
# OpenCV, used here to open/read video files and handle frames
import cv2
#import backend.admin_routes

os.makedirs("uploads", exist_ok=True)
os.makedirs("motion_outputs", exist_ok=True)
os.makedirs("deviation_gifs", exist_ok=True)
os.makedirs("tips", exist_ok=True)
# Pillow: animated GIFs for top deviation moments (optional at runtime if missing).
try:
    from PIL import Image

    _PIL_IMAGE = Image
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_IMAGE = None
    _PIL_AVAILABLE = False

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

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 Megabytes

CORS(app, resources={r"/*": {"origins": "*"}})

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
                ct = "application/octet-stream"
                if local_path.endswith(".png"):
                    ct = "image/png"
                elif local_path.endswith(".gif"):
                    ct = "image/gif"
                elif local_path.endswith(".json"):
                    ct = "application/json"
                elif local_path.endswith(".log") or local_path.endswith(".txt"):
                    ct = "text/plain"
                with open(local_path, "rb") as f:
                    client.storage.from_(bucket).upload(storage_key, f, file_options={"content-type": ct})
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
                if local_path.endswith(".log") or local_path.endswith(".txt"):
                    content_type = "text/plain"
                elif local_path.endswith(".gif"):
                    content_type = "image/gif"
                elif local_path.endswith(".json"):
                    content_type = "application/json"
                else:
                    content_type = "image/png"
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
DEVIATION_GIFS_FOLDER = "deviation_gifs"  # Short GIFs along DTW path for top worst-deviation ranks
ANALYSIS_UI_FOLDER = "analysis_ui"  # JSON bundles for frontend: tips + per-moment explanations next to GIFs

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(TIPS_FOLDER, exist_ok=True)
os.makedirs(DEVIATION_SCREENSHOTS_FOLDER, exist_ok=True)
os.makedirs(POSE_MATCH_SCREENSHOTS_FOLDER, exist_ok=True)
os.makedirs(DEVIATION_GIFS_FOLDER, exist_ok=True)
os.makedirs(ANALYSIS_UI_FOLDER, exist_ok=True)

# ----- FFmpeg & Downsampling Configuration -----
UPLOAD_DIR = "/tmp/danceperfect"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_video_duration(video_path):
    """Uses ffprobe to quickly read video metadata and return duration in seconds."""
    command = [
        'ffprobe', '-v', 'error', 
        '-show_entries', 'format=duration', 
        '-of', 'default=noprint_wrappers=1:nokey=1', 
        video_path
    ]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def downsample_video(input_path, output_path):
    """Downsamples raw video to 480p at 15fps to conserve CPU during MediaPipe tracking."""
    command = [
        'ffmpeg', '-y',
        '-i', input_path,
        '-vf', 'scale=-2:480,fps=15', # Force 480p height, drop framerate to 15fps
        '-c:v', 'libx264', 
        '-crf', '28',                  # Aggressive compression
        '-preset', 'veryfast',         # Prioritize encoding speed
        output_path
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

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
IMPORTANT_LANDMARKS = [
    11, 12, 13, 14, 15, 16,   # shoulders, elbows, wrists
    23, 24, 25, 26, 27, 28,   # hips, knees, ankles
    29, 30, 31, 32            # feet (tip, heel)
]
HIP_LEFT_VEC_IDX = 6 * 3   # 18: landmark 23
HIP_RIGHT_VEC_IDX = 7 * 3  # 21: landmark 24
SHOULDER_LEFT_VEC_IDX = 0 * 3   # 0: landmark 11
SHOULDER_RIGHT_VEC_IDX = 1 * 3  # 3: landmark 12

MOTION_FPS = 8
DEFAULT_FPS = MOTION_FPS
MAX_FPS = MOTION_FPS
MAX_PROCESS_FRAME_LONG_SIDE = 640

ACCEPTABLE_SIMILARITY_PERCENT = 80  # Minimum similarity to be "within acceptable range"

NUM_DEVIATION_SCREENSHOTS = 3   # Frames where user deviates most from reference
NUM_POSE_MATCH_SCREENSHOTS = 3  # Frames where user pose is most identical to reference
NUM_DEVIATION_GIFS = 3
DEVIATION_GIF_PATH_RADIUS = 5   # path steps before/after peak → up to 2*R+1 frames per GIF
DEVIATION_GIF_PLAYBACK_FPS = 6  # GIF frame delay (not motion CSV FPS)
DEVIATION_VISUAL_LEGEND = (
    "The red glowing lines in the body means that the body part is deviating from the reference"
)
POSE_MATCH_MAX_DISTANCE = 0.15  # Pairs with distance > this are excluded from best_pose_matches

MOTION_ACTIVITY_THRESHOLD = 0.006
MIN_ACTIVE_RUN_FRAMES = 5
MOTION_START_COOLDOWN_FRAMES = 4    # ~0.5 s at 8 FPS; avoids first standing/transition section
MOTION_END_COOLDOWN_FRAMES = 4      # same logic at end to avoid wind-down section
FEEDBACK_CORE_START_COOLDOWN_FRAMES = 12  # ~1.5 s at 8 FPS
REF_TORSO_CRUNCH_THRESHOLD = 0.22  # normalized; ref must be below this to count as crunch

BODY_LANDMARKS = {
    "shoulders": [11, 12],   # left, right
    "elbows": [13, 14],
    "wrists": [15, 16],
    "hips": [23, 24],
    "knees": [25, 26],
    "ankles": [27, 28],
}

def get_video_info(video_path):
    """Get frame count, FPS, and duration of the original video file (for display only)."""
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
    """Run pose detection on the video and write motion to CSV."""
    duration = get_video_duration(video_path)
    if duration > 61.0:
        raise ValueError("Video exceeds maximum limit of 1 minute")

    unique_id = str(uuid.uuid4())
    processing_path = os.path.join(UPLOAD_DIR, f"proc_{unique_id}.mp4")

    try:
        downsample_video(video_path, processing_path)
        cap = cv2.VideoCapture(processing_path)
        fps_src = cap.get(cv2.CAP_PROP_FPS)
        if fps_src <= 0:
            fps_src = float(DEFAULT_FPS)
        fps_src = float(fps_src)
        step = max(1, round(fps_src / max_fps))
        effective_fps = fps_src / step

        source_index = 0   
        output_frame_number = 0   
        
        with open(output_csv, "w", newline="", encoding="utf-8") as out_f:
            writer = csv.writer(out_f)
            writer.writerow(["frame", "landmark_id", "x", "y", "z", "visibility"])

            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    break

                if source_index % step == 0:
                    output_frame_number += 1

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

                    del rgb_frame, results, frame
                else:
                    del frame
                source_index += 1

                if source_index % 300 == 0:
                    gc.collect()

        cap.release()
        return round(effective_fps, 2)

    finally:
        if os.path.exists(processing_path):
            try:
                os.remove(processing_path)
            except Exception:
                pass

def save_deviation_screenshot(video_path, frame_number_1based, output_path, fps=DEFAULT_FPS):
    """Draw the skeleton overlay and a timestamp at the bottom, then save to output_path."""
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

    sec = (frame_number_1based - 1) / max(float(fps), 1e-6)
    minutes = int(sec // 60)
    seconds = int(sec % 60)
    timestamp_str = f"[{minutes}:{seconds:02d}]"
    h, w = frame.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.0
    thickness = 2
    (tw, th), _ = cv2.getTextSize(timestamp_str, font, font_scale, thickness)
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
    if not pose_landmarks or not pose_landmarks.landmark:
        return None
    return [(lm.x, lm.y) for lm in pose_landmarks.landmark]

def _mismatched_landmark_indices(ref_pts, user_pts, distance_thresh=0.08):
    if not ref_pts or not user_pts or len(ref_pts) != len(user_pts):
        return set()
    mismatched = set()
    for i in range(min(len(ref_pts), len(user_pts))):
        d = ((ref_pts[i][0] - user_pts[i][0]) ** 2 + (ref_pts[i][1] - user_pts[i][1]) ** 2) ** 0.5
        if d > distance_thresh:
            mismatched.add(i)
    return mismatched

def _compose_deviation_side_by_side_bgr(
    frame_ref,
    frame_user,
    user_label=None,
    landmark_match_thresh=None,
    tips_list=None,
    simple_column_headers=False,
):
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

    frame_ref_bgr = frame_ref.copy()
    mp_drawing.draw_landmarks(
        frame_ref_bgr,
        res_ref.pose_landmarks,
        mp_pose.POSE_CONNECTIONS,
        landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style(),
    )

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

    h1, w1 = frame_ref_bgr.shape[:2]
    h2, w2 = frame_user_bgr.shape[:2]
    target_h = max(h1, h2)
    if h1 != target_h:
        frame_ref_bgr = cv2.resize(frame_ref_bgr, (int(w1 * target_h / h1), target_h))
    if h2 != target_h:
        frame_user_bgr = cv2.resize(frame_user_bgr, (int(w2 * target_h / h2), target_h))
    w_left = frame_ref_bgr.shape[1]
    side_by_side = np.hstack([frame_ref_bgr, frame_user_bgr])

    if simple_column_headers:
        cv2.putText(side_by_side, "reference", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(side_by_side, "you", (w_left + 10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    else:
        cv2.putText(side_by_side, "Reference", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        if user_label is None:
            user_label = "You. Red glowing line means the body part is not matching the choreographer."
        (tw, th), _ = cv2.getTextSize(user_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        x_right = side_by_side.shape[1] - tw - 10
        cv2.putText(side_by_side, user_label, (max(x_right, w_left + 10), 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)

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

    return side_by_side

def _user_motion_csv_timestamp_str(motion_csv_frame_1based, motion_fps):
    sec = (int(motion_csv_frame_1based) - 1) / max(float(motion_fps), 1e-6)
    m, s = int(sec // 60), int(sec % 60)
    return f"[{m}:{s:02d}]"

def _deviation_gif_clip_time_meta(path_segment, user_start, user_motion_fps):
    if not path_segment:
        return None
    u0 = user_start + int(path_segment[0][1])
    u1 = user_start + int(path_segment[-1][1])
    t0 = _user_motion_csv_timestamp_str(u0, user_motion_fps)
    t1 = _user_motion_csv_timestamp_str(u1, user_motion_fps)
    label = t0 if t0 == t1 else f"{t0}–{t1}"
    return {
        "user_time_clip_start": t0,
        "user_time_clip_end": t1,
        "user_time_clip_label": label,
    }

def save_deviation_alignment_gif(
    ref_video_path,
    user_video_path,
    path_segment,
    ref_start,
    user_start,
    ref_motion_fps,
    user_motion_fps,
    output_path,
    user_label=None,
    landmark_match_thresh=None,
    playback_fps=None,
):
    if not _PIL_AVAILABLE or not path_segment:
        return None
    playback_fps = playback_fps if playback_fps and playback_fps > 0 else DEVIATION_GIF_PLAYBACK_FPS

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

    pil_frames = []
    try:
        for rj, uj in path_segment:
            ref_csv_f = ref_start + int(rj)
            user_csv_f = user_start + int(uj)
            cap_ref.set(cv2.CAP_PROP_POS_FRAMES, (ref_csv_f - 1) * ref_step)
            cap_user.set(cv2.CAP_PROP_POS_FRAMES, (user_csv_f - 1) * user_step)
            ok_ref, frame_ref = cap_ref.read()
            ok_user, frame_user = cap_user.read()
            if not ok_ref or not ok_user or frame_ref is None or frame_user is None:
                continue
            composed = _compose_deviation_side_by_side_bgr(
                frame_ref,
                frame_user,
                user_label=user_label,
                landmark_match_thresh=landmark_match_thresh,
                tips_list=None,
                simple_column_headers=True,
            )
            if composed is None:
                continue
            rgb = cv2.cvtColor(composed, cv2.COLOR_BGR2RGB)
            pil_frames.append(_PIL_IMAGE.fromarray(rgb))
    finally:
        cap_ref.release()
        cap_user.release()

    if not pil_frames:
        return None
    duration_ms = int(round(1000.0 / max(float(playback_fps), 1e-6)))
    try:
        pil_frames[0].save(
            output_path,
            save_all=True,
            append_images=pil_frames[1:],
            duration=duration_ms,
            loop=0,
            optimize=False,
        )
        return output_path if os.path.isfile(output_path) else None
    except Exception:
        return None

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

    side_by_side = _compose_deviation_side_by_side_bgr(
        frame_ref,
        frame_user,
        user_label=user_label,
        landmark_match_thresh=landmark_match_thresh,
        tips_list=tips_list,
    )
    if side_by_side is None:
        return None

    try:
        cv2.imwrite(output_path, side_by_side)
        return output_path
    except Exception:
        return None

# =========================================================================
#  FIXED & CORRECTED FUNCTIONS BELOW:
# =========================================================================

def _activity_per_frame(df, landmark_ids=None):
    """
    Per-frame motion activity: mean Euclidean distance of landmark positions
    from the previous frame (normalized coords). Mitigates zero-drop tracking anomalies.
    """
    if landmark_ids is None:
        landmark_ids = IMPORTANT_LANDMARKS
    frames = sorted(df["frame"].unique())
    if len(frames) < 2:
        return pd.Series(dtype=float)

    pose_by_frame = {}
    last_valid_vec = [0.0, 0.0, 0.0] * len(landmark_ids)

    for f in frames:
        frame_data = df[df["frame"] == f]
        vec = []
        for lm_id in landmark_ids:
            row = frame_data[frame_data["landmark_id"] == lm_id]
            if not row.empty:
                r = row.iloc[0]
                vec.extend([r["x"], r["y"], r["z"]])
            else:
                # Fallback to historical coordinate vectors instead of jumping to absolute 0
                vec.extend(last_valid_vec[len(vec):len(vec)+3])
        
        if any(v != 0.0 for v in vec):
            last_valid_vec = vec
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
    Find the frame range where the dancer is actually moving.
    Applies a cooldown after motion start and before motion end to trim static stances.
    """
    frames = sorted(df["frame"].unique())
    if len(frames) < 2:
        return (frames[0], frames[0]) if frames else (1, 1)

    activity = _activity_per_frame(df)
    active_list = [activity.get(f, 0.0) > activity_threshold for f in frames]

    run_start = None
    run_end = None
    best_len = 0
    
    i = 0
    while i < len(frames):
        if active_list[i]:
            j = i
            # Correctly trace the length of continuous movement
            while j < len(frames) and active_list[j]:
                j += 1
            current_len = j - i
            if current_len >= min_run_frames and current_len > best_len:
                best_len = current_len
                run_start = i
                run_end = j - 1
            i = j
        else:
            i += 1

    if run_start is not None and run_end is not None:
        start_frame = frames[run_start] + start_cooldown_frames
        end_frame = frames[run_end] - end_cooldown_frames
        
        if start_frame >= end_frame:
            return (frames[0], frames[-1])
        return (max(frames[0], start_frame), min(frames[-1], end_frame))
    
    return (frames[0], frames[-1])


def compare_motion_csvs_dtw(ref_csv, user_csv, ref_fps=DEFAULT_FPS, user_fps=DEFAULT_FPS):
    """Compare sequences using fastdtw and return a structural feedback summary."""
    if not _DTW_AVAILABLE:
        return {"message": "DTW packages not installed"}, {}

    try:
        df_ref = pd.read_csv(ref_csv)
        df_user = pd.read_csv(user_csv)
    except Exception as e:
        return {"message": f"Error reading target CSV files: {str(e)}"}, {}

    r_start, r_end = detect_motion_range(df_ref)
    u_start, u_end = detect_motion_range(df_user)

    # Build sequence matrix arrays
    ref_seq = []
    ref_frames = []
    for f in sorted(df_ref["frame"].unique()):
        if r_start <= f <= r_end:
            f_data = df_ref[df_ref["frame"] == f]
            v = []
            for l_id in IMPORTANT_LANDMARKS:
                row = f_data[f_data["landmark_id"] == l_id]
                v.extend([row.iloc[0]["x"], row.iloc[0]["y"], row.iloc[0]["z"]] if not row.empty else [0,0,0])
            ref_seq.append(np.array(v))
            ref_frames.append(f)

    user_seq = []
    user_frames = []
    for f in sorted(df_user["frame"].unique()):
        if u_start <= f <= u_end:
            f_data = df_user[df_user["frame"] == f]
            v = []
            for l_id in IMPORTANT_LANDMARKS:
                row = f_data[f_data["landmark_id"] == l_id]
                v.extend([row.iloc[0]["x"], row.iloc[0]["y"], row.iloc[0]["z"]] if not row.empty else [0,0,0])
            user_seq.append(np.array(v))
            user_frames.append(f)

    if not ref_seq or not user_seq:
        return {"message": "Insufficient motion sequence data found inside active ranges."}, {}

    # Crucial Fix: Call fastdtw directly using the verified imported name
    dtw_distance, path = fastdtw(ref_seq, user_seq, dist=euclidean)

    # Calculate standard baseline score mapping
    mean_dist = dtw_distance / len(path)
    score = max(0, min(100, int(100 * (1.0 - mean_dist))))

    results = {
        "dtw_distance": round(dtw_distance, 4),
        "dtw_similarity_score": score,
        "ref_sequence_length": len(ref_seq),
        "user_sequence_length": len(user_seq),
        "path_length": len(path),
        "path_sample_start": [[int(path[i][0]), int(path[i][1])] for i in range(min(5, len(path)))],
        "path_sample_end": [[int(path[i][0]), int(path[i][1])] for i in range(max(0, len(path)-5), len(path))]
    }

    return results, path

# =========================================================================
#  FLASK ROUTING API HANDLERS:
# =========================================================================

@app.route('/analyze', methods=['POST'])
def process_videos_test():
    if 'reference' not in request.files or 'user' not in request.files:
        return jsonify({"error": "Missing video fields: reference and user are required"}), 400

    ref_file = request.files['reference']
    user_file = request.files['user']
    run_id = str(uuid.uuid4())[:8]

    ref_path = os.path.join(UPLOAD_FOLDER, f"ref_{run_id}.mp4")
    user_path = os.path.join(UPLOAD_FOLDER, f"user_{run_id}.mp4")
    ref_file.save(ref_path)
    user_file.save(user_path)

    out_ref_csv = os.path.join(OUTPUT_FOLDER, f"ref_{run_id}.csv")
    out_user_csv = os.path.join(OUTPUT_FOLDER, f"user_{run_id}.csv")

    try:
        ref_fps = extract_motion_from_video(ref_path, out_ref_csv)
        user_fps = extract_motion_from_video(user_path, out_user_csv)

        return jsonify({
            "status": "success",
            "run_id": run_id,
            "ref_csv": out_ref_csv,
            "user_csv": out_user_csv,
            "ref_effective_fps": ref_fps,
            "user_effective_fps": user_fps
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(ref_path): os.remove(ref_path)
        if os.path.exists(user_path): os.remove(user_path)


@app.route('/api/compare-motion-csvs-test', methods=['POST'])
def compare_motion_csvs_test():
    data = request.get_json() or {}
    output1 = data.get("ref_csv")
    output2 = data.get("user_csv")

    if not output1 or not output2:
        return jsonify({"error": "Parameters ref_csv and user_csv are required"}), 400

    if not os.path.exists(output1) or not os.path.exists(output2):
        return jsonify({"error": "One or both target CSV outputs do not exist on disk"}), 404

    result, _ = compare_motion_csvs_dtw(output1, output2, ref_fps=DEFAULT_FPS, user_fps=DEFAULT_FPS)
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

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    from flask import send_from_directory
    return send_from_directory('deviation_gifs', filename.replace('deviation_gifs/', ''))

# ... All your existing code, app configuration, and supabase setup above ...

# --- REGISTER BLUEPRINT ROUTERS AT THE BOTTOM ---
from backend.admin_routes import admin_bp
app.register_blueprint(admin_bp)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
