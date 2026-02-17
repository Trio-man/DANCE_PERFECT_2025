# backend.py
# DancePerfect (Flask) Backend
# - Supabase (users table) + JWT auth endpoints
# - /analyze accepts 2 MP4s (dancer_video, choreo_video)
# - MediaPipe PoseLandmarker (Tasks) -> CSV
# - compare_motion_csvs() with detailed timeline coaching
# - Generates per-run PNG previews (unique per upload)
# - Serves visuals via Flask static: /static/outputs/<run_id>/...

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import mediapipe as mp
import os
import uuid
import tempfile
import mimetypes
from datetime import datetime
from pathlib import Path

import cv2
import pandas as pd
import numpy as np
from scipy.signal import correlate

from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# =========================
# ENV + SUPABASE
# =========================
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

print(f"SUPABASE_URL loaded: {'Yes' if SUPABASE_URL else 'No'}")
print(f"SUPABASE_KEY loaded: {'Yes' if SUPABASE_KEY else 'No'}")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# =========================
# FLASK APP
# =========================
# Flask serves ./static automatically at /static
app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
jwt = JWTManager(app)

# =========================
# FOLDERS
# =========================
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "motion_outputs"
LOG_FOLDER = "logs"
MODEL_FOLDER = "models"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(MODEL_FOLDER, exist_ok=True)

# Visual outputs (browser-accessible)
STATIC_OUTPUTS = os.path.join("static", "outputs")
os.makedirs(STATIC_OUTPUTS, exist_ok=True)

# =========================
# BASIC ROUTES
# =========================
@app.route("/")
def home():
    return "DancePerfect backend is running!"

@app.route("/test-connection")
def test_connection():
    try:
        response = supabase.table("users").select("*").limit(1).execute()
        return jsonify({"data": response.data, "message": "Database connection successful"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =========================
# AUTH (SUPABASE users table)
# =========================
@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    try:
        supabase.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "role": "user"
        }).execute()
        return jsonify({"message": "User registered successfully"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    try:
        response = supabase.table("users").select("*").eq("email", email).execute()
        if not response.data:
            return jsonify({"error": "Invalid email or password"}), 401

        user = response.data[0]
        stored_password_hash = user.get("password_hash")
        if not stored_password_hash:
            return jsonify({"error": "Invalid email or password"}), 401

        if bcrypt.checkpw(password.encode("utf-8"), stored_password_hash.encode("utf-8")):
            access_token = create_access_token(identity=user.get("id"))
            return jsonify({
                "message": "Login successful",
                "user": {
                    "id": user.get("id"),
                    "email": user.get("email"),
                    "role": user.get("role"),
                },
                "access_token": access_token
            }), 200

        return jsonify({"error": "Invalid email or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    current_user_id = get_jwt_identity()
    try:
        response = supabase.table("users").select("id, email, role").eq("id", current_user_id).execute()
        if not response.data:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"message": "Profile retrieved successfully", "user": response.data[0]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =========================
# SUPABASE STORAGE HELPERS
# =========================
def upload_bytes_to_storage(bucket: str, path: str, data: bytes, content_type: str):
    return supabase.storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"}
    )

# =========================
# MEDIAPIPE TASKS: PoseLandmarker
# =========================
def _get_pose_landmarker(video_fps: float):
    model_path = os.path.join(MODEL_FOLDER, "pose_landmarker_full.task")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Pose model not found: {model_path}\n"
            f"Put 'pose_landmarker_full.task' inside ./models beside backend.py"
        )

    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = mp_vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )
    return options

def _draw_tasks_landmarks(frame_bgr, pose_landmarks_list):
    """
    Draw pose landmarks for MediaPipe Tasks PoseLandmarker without using mp.solutions.
    Uses a fixed POSE_CONNECTIONS list (33-landmark BlazePose topology).
    """
    if not pose_landmarks_list:
        return frame_bgr

    # BlazePose connections (landmark index pairs)
    POSE_CONNECTIONS = [
        (0, 1), (1, 2), (2, 3), (3, 7),
        (0, 4), (4, 5), (5, 6), (6, 8),
        (9, 10),
        (11, 12),
        (11, 13), (13, 15), (15, 17), (15, 19), (15, 21),
        (12, 14), (14, 16), (16, 18), (16, 20), (16, 22),
        (11, 23), (12, 24), (23, 24),
        (23, 25), (25, 27), (27, 29), (29, 31),
        (24, 26), (26, 28), (28, 30), (30, 32),
        (27, 31), (28, 32)
    ]

    h, w, _ = frame_bgr.shape
    landmarks = pose_landmarks_list[0]  # first detected pose

    # Draw connections
    for a, b in POSE_CONNECTIONS:
        if a < len(landmarks) and b < len(landmarks):
            ax, ay = int(landmarks[a].x * w), int(landmarks[a].y * h)
            bx, by = int(landmarks[b].x * w), int(landmarks[b].y * h)
            cv2.line(frame_bgr, (ax, ay), (bx, by), (0, 255, 0), 2)

    # Draw points
    for lm in landmarks:
        cx = int(lm.x * w)
        cy = int(lm.y * h)
        cv2.circle(frame_bgr, (cx, cy), 4, (0, 255, 0), -1)

    return frame_bgr

def extract_motion_from_video(video_path, output_csv):
    """
    Extract pose landmarks per frame into CSV:
    frame, landmark_id, x, y, z, visibility
    """
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    options = _get_pose_landmarker(fps)

    data = []
    frame_number = 0

    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            frame_number += 1
            timestamp_ms = int((frame_number / fps) * 1000)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks:
                landmarks = result.pose_landmarks[0]
                for landmark_id, lm in enumerate(landmarks):
                    data.append([frame_number, landmark_id, lm.x, lm.y, lm.z, lm.visibility])

    cap.release()

    df = pd.DataFrame(data, columns=["frame", "landmark_id", "x", "y", "z", "visibility"])
    df.to_csv(output_csv, index=False)

# =========================
# VISUAL OUTPUTS (PNG previews ONLY)
# =========================
def save_pose_preview_frames_tasks(video_path: str, out_dir: str, every_n_frames: int = 30, max_frames: int = 1):
    os.makedirs(out_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open input video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    options = _get_pose_landmarker(fps)

    saved_paths = []
    frame_number = 0
    saved = 0

    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened() and saved < max_frames:
            ok, frame = cap.read()
            if not ok:
                break

            frame_number += 1
            if frame_number % every_n_frames != 0:
                continue

            timestamp_ms = int((frame_number / fps) * 1000)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks:
                frame = _draw_tasks_landmarks(frame, result.pose_landmarks)

            out_path = os.path.join(out_dir, f"pose_preview_{saved + 1}.png")
            cv2.imwrite(out_path, frame)
            saved_paths.append(out_path)
            saved += 1

    cap.release()
    return saved_paths

def to_public_url(local_static_path: str):
    """
    Convert a local file under ./static into a browser URL under /static.
    Example: static/outputs/<run>/user/previews/pose_preview_1.png -> /static/outputs/<run>/user/previews/pose_preview_1.png
    """
    p = local_static_path.replace("\\", "/")
    if p.startswith("static/"):
        p = p[len("static/"):]
    return f"/static/{p}"

# =========================
# COMPARE: detailed feedback + timeline coaching
# =========================
def compare_motion_csvs(reference_csv_path, user_csv_path, frame_rate=30):
    ref_df = pd.read_csv(reference_csv_path)
    usr_df = pd.read_csv(user_csv_path)

    needed = {"frame", "landmark_id", "x", "y", "z"}
    if not needed.issubset(ref_df.columns) or not needed.issubset(usr_df.columns):
        return {
            "status": "fail",
            "reason": "invalid_csv",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "CSV format invalid. Required columns: frame, landmark_id, x, y, z.",
            "feedback": {
                "summary": "We couldn't analyze because the motion CSV format is invalid.",
                "timing": "N/A",
                "body_part_comments": ["Fix CSV columns: frame, landmark_id, x, y, z."],
                "top_errors": [],
                "detailed_timeline": []
            }
        }

    ref_frames = set(ref_df["frame"].unique())
    usr_frames = set(usr_df["frame"].unique())
    common_frames = sorted(ref_frames & usr_frames)

    if not common_frames:
        return {
            "status": "fail",
            "reason": "no_common_frames",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No common frames to compare (pose not detected).",
            "feedback": {
                "summary": "No matching pose frames were detected between the two videos.",
                "timing": "Timing feedback unavailable because there were no comparable frames.",
                "body_part_comments": [
                    "Record with better lighting and keep the full body visible in frame."
                ],
                "top_errors": [],
                "detailed_timeline": []
            }
        }

    # mismatch detector config
    MISMATCH_MIN_CORR = 0.35
    MISMATCH_MAX_MEAN_DIST = 0.55
    MIN_FRAMES_FOR_MISMATCH_CHECK = 60

    GROUPS = {
        "Head/Neck": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "Torso": [11, 12, 23, 24],
        "Left Arm": [11, 13, 15, 17, 19, 21],
        "Right Arm": [12, 14, 16, 18, 20, 22],
        "Left Leg": [23, 25, 27, 29, 31],
        "Right Leg": [24, 26, 28, 30, 32],
    }

    LANDMARK_NAME = {
        0: "Nose",
        11: "Left Shoulder", 12: "Right Shoulder",
        13: "Left Elbow", 14: "Right Elbow",
        15: "Left Wrist", 16: "Right Wrist",
        23: "Left Hip", 24: "Right Hip",
        25: "Left Knee", 26: "Right Knee",
        27: "Left Ankle", 28: "Right Ankle",
        31: "Left Foot", 32: "Right Foot",
    }

    def to_sec(frame):
        return frame / float(frame_rate)

    def fmt_ts(sec: float) -> str:
        sec = max(0.0, float(sec))
        m = int(sec // 60)
        s = int(sec % 60)
        return f"{m:02d}:{s:02d}"

    def severity_label(d):
        if d >= 0.12:
            return "high"
        if d >= 0.07:
            return "medium"
        return "low"

    def direction_phrase(dx, dy):
        # MediaPipe: y increases DOWNWARD on screen
        parts = []
        tx, ty = 0.05, 0.05

        if abs(dy) >= ty:
            parts.append("lower" if dy > 0 else "higher")
        if abs(dx) >= tx:
            parts.append("more to the right" if dx > 0 else "more to the left")

        if not parts:
            return "slightly off position"
        if len(parts) == 1:
            return parts[0]
        return f"{parts[0]} and {parts[1]}"

    def build_detailed_timeline(frame_events, min_frames=6, gap_allow=2, limit=18):
        if not frame_events:
            return []

        frame_events.sort(key=lambda e: (e["group"], e["lid"], e["frame"]))

        merged = []
        cur = None

        for e in frame_events:
            if cur is None:
                cur = {
                    "group": e["group"],
                    "lid": e["lid"],
                    "name": e["name"],
                    "start_frame": e["frame"],
                    "end_frame": e["frame"],
                    "max_dist": e["dist"],
                    "sum_dx": e["dx"],
                    "sum_dy": e["dy"],
                    "count": 1,
                    "severity": e["severity"],
                }
                continue

            same = (cur["group"] == e["group"] and cur["lid"] == e["lid"])
            close = (e["frame"] <= cur["end_frame"] + gap_allow)

            if same and close:
                cur["end_frame"] = e["frame"]
                cur["max_dist"] = max(cur["max_dist"], e["dist"])
                cur["sum_dx"] += e["dx"]
                cur["sum_dy"] += e["dy"]
                cur["count"] += 1
                if e["severity"] == "high":
                    cur["severity"] = "high"
                elif e["severity"] == "medium" and cur["severity"] == "low":
                    cur["severity"] = "medium"
            else:
                merged.append(cur)
                cur = {
                    "group": e["group"],
                    "lid": e["lid"],
                    "name": e["name"],
                    "start_frame": e["frame"],
                    "end_frame": e["frame"],
                    "max_dist": e["dist"],
                    "sum_dx": e["dx"],
                    "sum_dy": e["dy"],
                    "count": 1,
                    "severity": e["severity"],
                }

        if cur:
            merged.append(cur)

        merged = [m for m in merged if (m["end_frame"] - m["start_frame"] + 1) >= min_frames]
        if not merged:
            return []

        sev_rank = {"high": 2, "medium": 1, "low": 0}
        merged.sort(key=lambda m: (sev_rank.get(m["severity"], 0), m["max_dist"]), reverse=True)
        merged = merged[:limit]

        out = []
        for m in merged:
            start_s = to_sec(m["start_frame"])
            end_s = to_sec(m["end_frame"])
            avg_dx = m["sum_dx"] / max(1, m["count"])
            avg_dy = m["sum_dy"] / max(1, m["count"])
            phrase = direction_phrase(avg_dx, avg_dy)

            out.append({
                "start": fmt_ts(start_s),
                "end": fmt_ts(end_s),
                "severity": m["severity"],
                "body_part": m["group"],
                "joint": m["name"],
                "message": f"{m['name']} ({m['group']}) is {phrase} than the choreographer."
            })

        out.sort(key=lambda x: x["start"])
        return out

    worst_by_landmark = {}
    distances_all = []
    group_dists = {k: [] for k in GROUPS.keys()}
    timeline_events_all = []

    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        usr_f = usr_df.loc[usr_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(usr_f, on="landmark_id", suffixes=("_ref", "_usr"))
        if merged.empty:
            continue

        merged["dx"] = merged["x_usr"] - merged["x_ref"]
        merged["dy"] = merged["y_usr"] - merged["y_ref"]
        merged["dist"] = np.sqrt(
            (merged["dx"]) ** 2 +
            (merged["dy"]) ** 2 +
            (merged["z_usr"] - merged["z_ref"]) ** 2
        )

        distances_all.extend(merged["dist"].tolist())

        for gname, lids in GROUPS.items():
            g = merged[merged["landmark_id"].isin(lids)]
            if len(g) > 0:
                group_dists[gname].extend(g["dist"].tolist())

        for _, row in merged.iterrows():
            lid = int(row["landmark_id"])
            dist = float(row["dist"])
            if lid not in worst_by_landmark or dist > worst_by_landmark[lid]["dist"]:
                worst_by_landmark[lid] = {
                    "frame": int(frame),
                    "dist": dist,
                    "dx": float(row["dx"]),
                    "dy": float(row["dy"]),
                }

        # timeline events (keep medium/high only)
        for _, row in merged.iterrows():
            lid = int(row["landmark_id"])
            dist = float(row["dist"])
            if dist < 0.07:
                continue

            group_name = None
            for gname, lids in GROUPS.items():
                if lid in lids:
                    group_name = gname
                    break
            if group_name is None:
                continue

            timeline_events_all.append({
                "frame": int(frame),
                "lid": lid,
                "name": LANDMARK_NAME.get(lid, f"Landmark {lid}"),
                "group": group_name,
                "dist": dist,
                "dx": float(row["dx"]),
                "dy": float(row["dy"]),
                "severity": severity_label(dist)
            })

    if len(distances_all) == 0:
        return {
            "status": "fail",
            "reason": "no_distances",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No comparable landmark rows found in common frames.",
            "feedback": {
                "summary": "We couldn't compute differences because landmarks did not overlap properly.",
                "timing": "N/A",
                "body_part_comments": ["Try keeping the full body visible and avoid occlusions."],
                "top_errors": [],
                "detailed_timeline": []
            }
        }

    mean_distance = float(np.mean(distances_all))
    similarity_score = float(np.clip(100 - (mean_distance * 100), 0, 100))

    # mismatch check
    def landmark_series(df, lid, axis="y"):
        s = df[df["landmark_id"] == lid].sort_values("frame")
        if axis == "x":
            return s["x"].to_numpy()
        return s["y"].to_numpy()

    def norm(sig):
        if len(sig) < 10:
            return None
        sig = sig.astype(np.float64)
        sig = sig - np.mean(sig)
        std = np.std(sig)
        if std < 1e-9:
            return None
        return sig / std

    def max_corr(a, b):
        a = norm(a)
        b = norm(b)
        if a is None or b is None:
            return None
        c = correlate(a, b, mode="full")
        denom = len(a)
        if denom <= 0:
            return None
        return float(np.max(c) / denom)

    corr_landmarks = [16, 15, 28, 27, 24, 23]
    corrs = []
    if len(common_frames) >= MIN_FRAMES_FOR_MISMATCH_CHECK:
        for lid in corr_landmarks:
            r = landmark_series(ref_df, lid, "y")
            u = landmark_series(usr_df, lid, "y")
            mc = max_corr(u, r)
            if mc is not None and not np.isnan(mc):
                corrs.append(mc)

    avg_corr = float(np.mean(corrs)) if len(corrs) else None

    is_mismatch = False
    if avg_corr is not None and avg_corr < MISMATCH_MIN_CORR:
        is_mismatch = True
    if mean_distance > MISMATCH_MAX_MEAN_DIST:
        is_mismatch = True

    if is_mismatch:
        return {
            "status": "fail",
            "reason": "different_dance",
            "similarity_score": 0.0,
            "mean_landmark_distance": round(mean_distance, 6),
            "frames_compared": len(common_frames),
            "message": "Different dance detected (movement patterns do not match the reference).",
            "feedback": {
                "summary": "Analysis failed because the detected movement patterns do not match the reference choreography.",
                "timing": "Timing comparison is not meaningful when dances do not match.",
                "body_part_comments": [
                    "Make sure you are using the same choreography video as the reference.",
                    "Try trimming both videos so they start at the same beat."
                ],
                "top_errors": [
                    f"Mismatch check: avg correlation = {avg_corr:.2f}" if avg_corr is not None else
                    "Mismatch check: insufficient reliable signal for correlation."
                ],
                "detailed_timeline": []
            }
        }

    # timing lead/lag
    used_lid = 16
    ref_sig = landmark_series(ref_df, used_lid, "y")
    usr_sig = landmark_series(usr_df, used_lid, "y")

    if len(ref_sig) < 10 or len(usr_sig) < 10:
        used_lid = 28
        ref_sig = landmark_series(ref_df, used_lid, "y")
        usr_sig = landmark_series(usr_df, used_lid, "y")

    timing_comment = "Timing feedback unavailable."
    if len(ref_sig) >= 10 and len(usr_sig) >= 10:
        ref0 = ref_sig - np.mean(ref_sig)
        usr0 = usr_sig - np.mean(usr_sig)
        c = correlate(usr0, ref0, mode="full")
        lag_frames = int(np.argmax(c) - (len(ref0) - 1))
        lag_seconds = lag_frames / float(frame_rate)

        if lag_frames > 3:
            timing_comment = (
                f"You are BEHIND the choreographer by about {abs(lag_seconds):.2f}s. "
                f"Try starting transitions slightly earlier."
            )
        elif lag_frames < -3:
            timing_comment = (
                f"You are AHEAD of the choreographer by about {abs(lag_seconds):.2f}s. "
                f"Try holding positions slightly longer before switching moves."
            )
        else:
            timing_comment = "Your timing is close to the choreographer."

    # body-part worst 2 groups
    group_means = {g: (float(np.mean(v)) if len(v) else 0.0) for g, v in group_dists.items()}
    worst_groups = sorted(group_means.items(), key=lambda x: x[1], reverse=True)[:2]

    body_part_comments = []
    for gname, d in worst_groups:
        sev = severity_label(d)
        if sev == "high":
            body_part_comments.append(f"{gname}: major mismatch. Focus on matching angles and movement path.")
        elif sev == "medium":
            body_part_comments.append(f"{gname}: noticeable mismatch. Tighten control and follow the reference shape.")
        else:
            body_part_comments.append(f"{gname}: minor mismatch. Small refinements will improve accuracy.")

    # top errors (worst moments)
    worst_sorted = sorted(worst_by_landmark.items(), key=lambda kv: kv[1]["dist"], reverse=True)[:5]
    top_errors = []
    for lid, info in worst_sorted:
        name = LANDMARK_NAME.get(lid, f"Landmark {lid}")
        t = to_sec(info["frame"])
        phrase = direction_phrase(info["dx"], info["dy"])
        top_errors.append(f"At ~{t:.2f}s: {name} is {phrase} than the choreographer.")

    detailed_timeline = build_detailed_timeline(timeline_events_all)

    score = round(similarity_score, 2)
    worst_group_name = worst_groups[0][0] if worst_groups else "overall posture"

    if score >= 90:
        summary = f"Excellent match overall. Small differences mainly in {worst_group_name}."
    elif score >= 75:
        summary = f"Good performance with manageable differences. Biggest issues are in {worst_group_name}."
    elif score >= 60:
        summary = f"Fair alignment. Clear differences exist, mostly in {worst_group_name}."
    else:
        summary = f"Needs improvement. Large differences detected, especially in {worst_group_name}."

    used_name = LANDMARK_NAME.get(used_lid, f"landmark {used_lid}")
    if "unavailable" not in timing_comment.lower():
        summary += f" Timing was estimated using {used_name} motion."

    return {
        "status": "success",
        "similarity_score": score,
        "mean_landmark_distance": round(mean_distance, 6),
        "frames_compared": len(common_frames),
        "feedback": {
            "summary": summary,
            "timing": timing_comment,
            "body_part_comments": body_part_comments if body_part_comments else [
                "Overall movement is consistent. Focus on matching key joint positions more precisely."
            ],
            "top_errors": top_errors if top_errors else [
                "No single joint stood out strongly; small differences are spread across joints."
            ],
            "detailed_timeline": detailed_timeline
        }
    }

# =========================
# /analyze : returns score + feedback + visuals (PNG previews)
# - Optional: store original MP4s in Supabase Storage when store_in_supabase=true
# =========================
@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        print("---- /analyze called ----")
        print("Incoming files:", list(request.files.keys()))
        print("Incoming form:", dict(request.form))

        # ✅ Check required files
        if "dancer_video" not in request.files or "choreo_video" not in request.files:
            return jsonify({
                "error": "Missing upload files",
                "expected_fields": ["dancer_video", "choreo_video"],
                "received_fields": list(request.files.keys())
            }), 400

        dancer = request.files["dancer_video"]   # user/dancer
        choreo = request.files["choreo_video"]   # reference/choreo

        if dancer.filename == "" or choreo.filename == "":
            return jsonify({"error": "One or both uploaded files are empty"}), 400

        # ----------------------------
        # Flags from frontend
        # ----------------------------
        def _truthy(v: str) -> bool:
            return str(v or "").strip().lower() in ("1", "true", "yes", "y", "on")

        generate_preview = _truthy(request.form.get("generate_preview", "true"))

        # ✅ default to 1 (limit marker PNG to one)
        try:
            preview_max_frames = int(request.form.get("preview_max_frames", "1"))
        except Exception:
            preview_max_frames = 1

        # Optional: store original videos in Supabase Storage
        store_in_supabase = _truthy(request.form.get("store_in_supabase", "false"))
        storage_bucket = "videos"

        # ----------------------------
        # Unique run folder
        # ----------------------------
        run_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]

        run_root = os.path.join(STATIC_OUTPUTS, run_id)
        ref_dir = os.path.join(run_root, "reference")
        usr_dir = os.path.join(run_root, "user")
        os.makedirs(ref_dir, exist_ok=True)
        os.makedirs(usr_dir, exist_ok=True)

        # ----------------------------
        # Save uploaded MP4s locally (needed for cv2/mediapipe)
        # ----------------------------
        ref_video_path = os.path.join(ref_dir, "reference.mp4")
        usr_video_path = os.path.join(usr_dir, "user.mp4")

        choreo.save(ref_video_path)
        dancer.save(usr_video_path)

        print("Saved videos:")
        print("  ref:", ref_video_path)
        print("  usr:", usr_video_path)

        # ----------------------------
        # OPTIONAL: Upload videos to Supabase Storage
        # ----------------------------
        storage_info = None
        if store_in_supabase:
            ref_ct = mimetypes.guess_type(choreo.filename)[0] or "video/mp4"
            usr_ct = mimetypes.guess_type(dancer.filename)[0] or "video/mp4"

            ref_storage_path = f"{run_id}/reference.mp4"
            usr_storage_path = f"{run_id}/user.mp4"

            with open(ref_video_path, "rb") as f:
                upload_bytes_to_storage(storage_bucket, ref_storage_path, f.read(), ref_ct)

            with open(usr_video_path, "rb") as f:
                upload_bytes_to_storage(storage_bucket, usr_storage_path, f.read(), usr_ct)

            storage_info = {
                "bucket": storage_bucket,
                "reference_path": ref_storage_path,
                "user_path": usr_storage_path
            }

        # ----------------------------
        # Extract motion CSVs
        # ----------------------------
        ref_csv = os.path.join(OUTPUT_FOLDER, f"{run_id}_reference_motion.csv")
        usr_csv = os.path.join(OUTPUT_FOLDER, f"{run_id}_user_motion.csv")

        print("Extracting CSVs...")
        extract_motion_from_video(ref_video_path, ref_csv)
        extract_motion_from_video(usr_video_path, usr_csv)

        # ----------------------------
        # Compare motions -> feedback + score
        # ----------------------------
        print("Comparing motions...")
        comparison = compare_motion_csvs(ref_csv, usr_csv, frame_rate=30)

        score = comparison.get("similarity_score", 0.0)
        feedback = comparison.get("feedback", {})

        # ----------------------------
        # Generate visuals (PNG previews ONLY)
        # ----------------------------
        visuals = {
            "reference": {"preview_images": []},
            "user": {"preview_images": []},
        }

        if generate_preview:
            print("Generating preview PNGs...")
            ref_prev_dir = os.path.join(ref_dir, "previews")
            usr_prev_dir = os.path.join(usr_dir, "previews")

            ref_pngs = save_pose_preview_frames_tasks(
                ref_video_path, ref_prev_dir, every_n_frames=30, max_frames=preview_max_frames
            )
            usr_pngs = save_pose_preview_frames_tasks(
                usr_video_path, usr_prev_dir, every_n_frames=30, max_frames=preview_max_frames
            )

            visuals["reference"]["preview_images"] = [to_public_url(p) for p in ref_pngs]
            visuals["user"]["preview_images"] = [to_public_url(p) for p in usr_pngs]

        return jsonify({
            "message": "Analysis complete",
            "score": score,
            "comparison": comparison,
            "feedback": feedback,
            "outputs": {
                "run_id": run_id,
                "visuals": visuals,
                "reference_video": to_public_url(ref_video_path),
                "user_video": to_public_url(usr_video_path),
                "reference_csv": ref_csv,
                "user_csv": usr_csv,
                "storage": storage_info
            }
        }), 200

    except Exception as e:
        app.logger.exception("Analyze failed")
        return jsonify({
            "error": "Analyze failed (server error)",
            "detail": str(e)
        }), 500

# =========================
# RUN
# =========================
if __name__ == "__main__":
    # host 0.0.0.0 so frontend can hit it from LAN too if needed
    app.run(debug=True, host="0.0.0.0", port=5000)