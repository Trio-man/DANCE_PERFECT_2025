# backend.py

# --- Imports: Flask for web server, CORS for cross-origin, Supabase for DB, dotenv for env vars, bcrypt for hashing, os for env access, JWT for tokens ---
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import mediapipe as mp
import os

# --- COMPUTATIONAL ALGORITHM IMPORTS ---
import tempfile
import uuid
import pandas as pd
import numpy as np
from scipy.signal import correlate
import json

# --- MP4 -> MediaPipe imports ---
import cv2
from datetime import datetime
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# --- Load environment variables from .env file ---
load_dotenv()

# --- Retrieve Supabase credentials from environment variables ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- Debug: Print if environment variables are loaded (remove in production) ---
print(f"SUPABASE_URL loaded: {'Yes' if SUPABASE_URL else 'No'}")
print(f"SUPABASE_KEY loaded: {'Yes' if SUPABASE_KEY else 'No'}")

# --- Validate environment variables ---
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")

# --- Initialize Supabase client for database operations ---
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Create Flask app and enable CORS for frontend-backend communication ---
app = Flask(__name__)
CORS(app)  # Allow frontend calls

# --- Configure JWT ---
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')  # Change this in production!
jwt = JWTManager(app)

# ================================================================================================
# STORAGE FOLDERS (needed for flowchart: upload -> run backend -> outputs)
# ================================================================================================
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "motion_outputs"
LOG_FOLDER = "logs"
MODEL_FOLDER = "models"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(MODEL_FOLDER, exist_ok=True)

# --- Route: Test database connection ---
@app.route('/test-connection')
def test_connection():
    try:
        response = supabase.table("users").select("*").limit(1).execute()
        return jsonify({"data": response.data, "message": "Database connection successful"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Route: Home page, simple health check ---
@app.route('/')
def home():
    return "DancePerfect backend is running!"

# --- Route: Test login with sample data ---
@app.route('/test-login')
def test_login():
    return """
    <h2>Test Login Endpoints</h2>
    <p>Use these curl commands to test:</p>

    <h3>1. Register a new user:</h3>
    <pre>curl -X POST http://localhost:5000/register \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "password123"}'</pre>

    <h3>2. Login with the user:</h3>
    <pre>curl -X POST http://localhost:5000/login \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "password123"}'</pre>

    <h3>3. Test with wrong password:</h3>
    <pre>curl -X POST http://localhost:5000/login \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "wrongpassword"}'</pre>
    """

# --- Route: User registration endpoint ---
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    email = data.get("email")
    password = data.get("password")

    print(f"Received registration attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    try:
        supabase.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "role": "user"
        }).execute()

        return jsonify({"message": "User registered successfully"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Route: User login endpoint ---
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    email = data.get("email")
    password = data.get("password")

    print(f"Received login attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

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

        if bcrypt.checkpw(password.encode('utf-8'), stored_password_hash.encode('utf-8')):
            access_token = create_access_token(identity=user.get("id"))

            user_info = {
                "id": user.get("id"),
                "email": user.get("email"),
                "role": user.get("role")
            }

            return jsonify({
                "message": "Login successful",
                "user": user_info,
                "access_token": access_token
            }), 200
        else:
            return jsonify({"error": "Invalid email or password"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Route: Protected endpoint that requires JWT token ---
@app.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    current_user_id = get_jwt_identity()

    try:
        response = supabase.table("users").select("id, email, role").eq("id", current_user_id).execute()

        if not response.data:
            return jsonify({"error": "User not found"}), 404

        user = response.data[0]
        return jsonify({
            "message": "Profile retrieved successfully",
            "user": user
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ================================================================================================
# MP4 -> MEDIAPIPE TASKS (PoseLandmarker) -> CSV -> COMPARE
# ================================================================================================
def extract_motion_from_video(video_path, output_csv):
    """
    Uses MediaPipe Tasks PoseLandmarker (mediapipe 0.10.x) to extract pose landmarks per frame.
    Outputs a CSV: frame, landmark_id, x, y, z, visibility
    """

    model_path = os.path.join(MODEL_FOLDER, "pose_landmarker_full.task")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Pose model not found: {model_path}\n"
            f"Create a folder 'models' beside backend.py and put 'pose_landmarker_full.task' inside it."
        )

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

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


# ✅ UPDATED: intelligent feedback version (replaces your old function)

def compare_motion_csvs(reference_csv_path, user_csv_path, frame_rate=30):
    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    needed_cols = {"frame", "landmark_id", "x", "y", "z"}
    if not needed_cols.issubset(ref_df.columns) or not needed_cols.issubset(user_df.columns):
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "CSV format invalid. Required columns: frame, landmark_id, x, y, z.",
            "feedback": {
                "summary": "We couldn't analyze because the motion CSV format is invalid.",
                "timing": "N/A",
                "body_part_comments": ["Ensure your motion CSV includes frame, landmark_id, x, y, z."],
                "top_errors": []
            }
        }

    ref_frames = set(ref_df["frame"].unique())
    user_frames = set(user_df["frame"].unique())
    common_frames = sorted(ref_frames & user_frames)

    if not common_frames:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No common frames to compare (check that both videos had pose detections).",
            "feedback": {
                "summary": "No matching pose frames were detected between the two videos.",
                "timing": "Timing feedback unavailable because there were no comparable frames.",
                "body_part_comments": [
                    "Try recording with better lighting and keep the full body visible in frame."
                ],
                "top_errors": []
            }
        }

    GROUPS = {
        "Head/Neck": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "Torso": [11, 12, 23, 24],
        "Left Arm": [11, 13, 15, 17, 19, 21],
        "Right Arm": [12, 14, 16, 18, 20, 22],
        "Left Leg": [23, 25, 27, 29, 31],
        "Right Leg": [24, 26, 28, 30, 32],
    }

    LANDMARK_NAME = {
        11: "Left Shoulder", 12: "Right Shoulder",
        13: "Left Elbow", 14: "Right Elbow",
        15: "Left Wrist", 16: "Right Wrist",
        23: "Left Hip", 24: "Right Hip",
        25: "Left Knee", 26: "Right Knee",
        27: "Left Ankle", 28: "Right Ankle",
        0: "Nose",
    }

    distances_all = []
    group_dists = {k: [] for k in GROUPS.keys()}
    landmark_dists = {i: [] for i in range(33)}

    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        usr_f = user_df.loc[user_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(usr_f, on="landmark_id", suffixes=("_ref", "_usr"))

        if merged.empty:
            continue

        merged["dist"] = np.sqrt(
            (merged["x_ref"] - merged["x_usr"]) ** 2 +
            (merged["y_ref"] - merged["y_usr"]) ** 2 +
            (merged["z_ref"] - merged["z_usr"]) ** 2
        )

        distances_all.extend(merged["dist"].tolist())

        for _, row in merged.iterrows():
            lid = int(row["landmark_id"])
            d = float(row["dist"])
            if 0 <= lid <= 32:
                landmark_dists[lid].append(d)

        for gname, lids in GROUPS.items():
            g = merged[merged["landmark_id"].isin(lids)]
            if len(g) > 0:
                group_dists[gname].extend(g["dist"].tolist())

    if len(distances_all) == 0:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No comparable landmark rows found in common frames.",
            "feedback": {
                "summary": "We couldn't compute distances because the detected landmarks did not overlap properly.",
                "timing": "N/A",
                "body_part_comments": ["Try keeping the full body visible and avoid occlusions."],
                "top_errors": []
            }
        }

    mean_distance = float(np.mean(distances_all))
    similarity_score = float(np.clip(100 - (mean_distance * 100), 0, 100))

    def landmark_series_y(df, lid):
        s = df[df["landmark_id"] == lid].sort_values("frame")
        return s["y"].to_numpy()

    used_lid = 16
    ref_sig = landmark_series_y(ref_df, used_lid)
    usr_sig = landmark_series_y(user_df, used_lid)

    if len(ref_sig) < 10 or len(usr_sig) < 10:
        used_lid = 28
        ref_sig = landmark_series_y(ref_df, used_lid)
        usr_sig = landmark_series_y(user_df, used_lid)

    timing_comment = "Timing feedback unavailable."
    if len(ref_sig) >= 10 and len(usr_sig) >= 10:
        ref_sig = ref_sig - np.mean(ref_sig)
        usr_sig = usr_sig - np.mean(usr_sig)
        corr = correlate(usr_sig, ref_sig, mode="full")
        lag_frames = int(np.argmax(corr) - (len(ref_sig) - 1))
        lag_seconds = lag_frames / float(frame_rate)

        if lag_frames > 3:
            timing_comment = (
                f"You are BEHIND the reference timing (~{lag_frames} frames, ~{lag_seconds:.2f}s). "
                f"Try initiating transitions slightly earlier to match the choreographer."
            )
        elif lag_frames < -3:
            timing_comment = (
                f"You are AHEAD of the reference timing (~{abs(lag_frames)} frames, ~{abs(lag_seconds):.2f}s). "
                f"Try holding positions a bit longer before moving to the next beat."
            )
        else:
            timing_comment = "Timing is close to the reference (no noticeable lead/lag)."

    group_means = {g: (float(np.mean(v)) if len(v) else 0.0) for g, v in group_dists.items()}
    worst_groups = sorted(group_means.items(), key=lambda x: x[1], reverse=True)[:2]

    def severity_label(d):
        if d >= 0.12:
            return "high"
        if d >= 0.07:
            return "medium"
        return "low"

    body_part_comments = []
    for gname, d in worst_groups:
        sev = severity_label(d)
        if sev == "high":
            body_part_comments.append(
                f"{gname}: major mismatch vs reference. Focus on matching angles and position paths more closely."
            )
        elif sev == "medium":
            body_part_comments.append(
                f"{gname}: noticeable differences. Tighten control and follow the reference movement path."
            )
        else:
            body_part_comments.append(
                f"{gname}: minor differences. Small refinements will improve accuracy."
            )

    landmark_avg = {lid: (float(np.mean(vals)) if len(vals) else 0.0) for lid, vals in landmark_dists.items()}
    top_landmarks = sorted(landmark_avg.items(), key=lambda x: x[1], reverse=True)[:5]

    top_errors = []
    for lid, d in top_landmarks:
        if d <= 0:
            continue
        name = LANDMARK_NAME.get(lid, f"Landmark {lid}")
        top_errors.append(f"{name}: deviation ≈ {d:.3f}")

    score = round(similarity_score, 2)
    frames_used = len(common_frames)
    worst_group_name = worst_groups[0][0] if worst_groups else "overall posture"

    if score >= 90:
        summary = (
            f"Excellent match. Your movements closely follow the choreographer with minimal pose deviation. "
            f"Most differences are small and mainly in {worst_group_name}."
        )
    elif score >= 75:
        summary = (
            f"Good performance with noticeable but manageable differences. "
            f"The score is mainly affected by mismatches in {worst_group_name} and slight timing/pose variation."
        )
    elif score >= 60:
        summary = (
            f"Fair alignment. There are clear deviations in pose and/or timing compared to the choreographer. "
            f"The largest issues appear in {worst_group_name}, which pulls the score down."
        )
    else:
        summary = (
            f"Needs improvement. Large pose differences or timing mismatch were detected. "
            f"Your {worst_group_name} alignment differs significantly from the reference, strongly affecting the score."
        )

    used_name = LANDMARK_NAME.get(used_lid, f"landmark {used_lid}")
    if "unavailable" not in timing_comment.lower():
        summary += f" Timing was estimated using {used_name} motion."

    return {
        "similarity_score": score,
        "mean_landmark_distance": round(mean_distance, 6),
        "frames_compared": frames_used,
        "feedback": {
            "summary": summary,
            "timing": timing_comment,
            "body_part_comments": body_part_comments if body_part_comments else [
                "Overall movement is consistent. Focus on matching key joint positions more precisely."
            ],
            "top_errors": top_errors if top_errors else [
                "No dominant joint error stood out; differences are spread across joints."
            ]
        }
    }


def write_result_log(video1_path, video2_path, output1, output2, comparison):
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

    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return log_path


@app.route("/analyze", methods=["POST"])
def analyze_videos():
    if "video1" not in request.files or "video2" not in request.files:
        return jsonify({"error": "Two videos are required (video1 and video2)."}), 400

    video1 = request.files["video1"]
    video2 = request.files["video2"]

    if video1.filename == "" or video2.filename == "":
        return jsonify({"error": "Both files must have names."}), 400

    video1_path = os.path.join(UPLOAD_FOLDER, "dance_reference.mp4")
    video2_path = os.path.join(UPLOAD_FOLDER, "dance_user.mp4")
    video1.save(video1_path)
    video2.save(video2_path)

    output1 = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
    output2 = os.path.join(OUTPUT_FOLDER, "user_motion.csv")

    try:
        extract_motion_from_video(video1_path, output1)
        extract_motion_from_video(video2_path, output2)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    comparison = compare_motion_csvs(output1, output2)
    log_path = write_result_log(video1_path, video2_path, output1, output2, comparison)

    return jsonify({
        "message": "Analysis complete",
        "score": comparison.get("similarity_score", 0),
        "comparison": comparison,
        "feedback": comparison.get("feedback", {}),
        "outputs": {"reference": output1, "user": output2},
        "log_file": log_path
    }), 200

# ================================================================================================
# YOUR .MOT ALIGNMENT SECTION (UNCHANGED - kept for later)
# ================================================================================================
def save_uploaded_file(file_data, file_extension=".tmp"):
    filename = f"upload_{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(tempfile.gettempdir(), filename)
    with open(file_path, 'wb') as f:
        f.write(file_data)
    return file_path

def cleanup_temp_files(*file_paths):
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Warning: Could not delete temp file {file_path}: {e}")

def read_mot_file(file_path):
    with open(file_path) as f:
        lines = f.readlines()
    start_index = next(i for i, line in enumerate(lines) if line.strip().startswith("time"))
    df = pd.read_csv(file_path, sep=r'\s+', skiprows=start_index)
    return df

def interpolate_to_match(ref, usr):
    usr_interp = usr.set_index('time').reindex(ref['time']).interpolate().reset_index()
    return usr_interp

def compute_pose_error(ref_motion, usr_motion):
    diff = np.abs(ref_motion.values - usr_motion.values)
    pose_error = np.mean(diff)
    return pose_error

def compute_timing_lag(ref_motion, usr_motion, key_joint='hip_flexion_r', frame_rate=60):
    if key_joint not in ref_motion.columns or key_joint not in usr_motion.columns:
        return 0.0
    ref_signal = ref_motion[key_joint] - ref_motion[key_joint].mean()
    usr_signal = usr_motion[key_joint] - usr_motion[key_joint].mean()
    corr = correlate(usr_signal, ref_signal, mode='full')
    lag = np.argmax(corr) - (len(ref_signal) - 1)
    lag_seconds = lag / frame_rate
    return lag_seconds

def compute_smoothness_error(motion):
    velocity = np.diff(motion.values, axis=0)
    smoothness_error = np.std(velocity)
    return smoothness_error

def compute_alignment_score(pose_error, timing_lag, smoothness_error, w1=0.6, w2=0.3, w3=0.1):
    pose_penalty = min(pose_error * 100, 100)
    timing_penalty = min(abs(timing_lag) * 10, 100)
    smoothness_penalty = min(smoothness_error * 50, 100)

    total_penalty = (w1 * pose_penalty) + (w2 * timing_penalty) + (w3 * smoothness_penalty)
    score = max(0, 100 - total_penalty)
    return score

def analyze_dance_alignment(ref_file, usr_file):
    ref = read_mot_file(ref_file)
    usr = read_mot_file(usr_file)

    usr_interp = interpolate_to_match(ref, usr)

    ref_motion = ref.drop(columns=['time'])
    usr_motion = usr_interp.drop(columns=['time'])

    pose_error = compute_pose_error(ref_motion, usr_motion)
    timing_lag = compute_timing_lag(ref_motion, usr_motion)
    smoothness_error = compute_smoothness_error(usr_motion)
    score = compute_alignment_score(pose_error, timing_lag, smoothness_error)

    if score > 90:
        feedback = "Excellent synchronization! Very close to the reference."
    elif score > 75:
        feedback = "Good performance. Slight timing or pose variations."
    elif score > 60:
        feedback = "Average alignment. Noticeable deviations in movement."
    else:
        feedback = "Needs improvement. Large misalignment detected."

    return {
        "pose_error": float(pose_error),
        "timing_lag_seconds": float(timing_lag),
        "smoothness_error": float(smoothness_error),
        "alignment_score": round(score, 2),
        "feedback": feedback
    }

def process_two_files(file1_path, file2_path, algorithm_params=None):
    try:
        print(f"Processing reference file: {file1_path}")
        print(f"Processing user file: {file2_path}")

        alignment_results = analyze_dance_alignment(file1_path, file2_path)

        return {
            "status": "success",
            "file1_processed": True,
            "file2_processed": True,
            "algorithm_results": alignment_results,
            "metadata": {
                "algorithm_version": "2.0",
                "algorithm_name": "Dance Alignment Analysis",
                "timestamp": "2025-01-01T12:00:00Z",
                "files_analyzed": {
                    "reference_file": os.path.basename(file1_path),
                    "user_file": os.path.basename(file2_path)
                }
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "file1_processed": False,
            "file2_processed": False
        }

@app.route('/api/analyze-dance-alignment', methods=['POST'])
@jwt_required()
def analyze_dance_alignment_endpoint():
    try:
        if 'reference_file' not in request.files or 'user_file' not in request.files:
            return jsonify({"error": "Both reference_file and user_file are required"}), 400

        reference_file = request.files['reference_file']
        user_file = request.files['user_file']

        if reference_file.filename == '' or user_file.filename == '':
            return jsonify({"error": "Both files must have names"}), 400

        if not (reference_file.filename.lower().endswith('.mot') and user_file.filename.lower().endswith('.mot')):
            return jsonify({"error": "Both files must be .mot files"}), 400

        algorithm_params = {
            'key_joint': request.form.get('key_joint', 'hip_flexion_r'),
            'frame_rate': float(request.form.get('frame_rate', 60)),
            'pose_weight': float(request.form.get('pose_weight', 0.6)),
            'timing_weight': float(request.form.get('timing_weight', 0.3)),
            'smoothness_weight': float(request.form.get('smoothness_weight', 0.1))
        }

        ref_path = save_uploaded_file(reference_file.read(), '.mot')
        usr_path = save_uploaded_file(user_file.read(), '.mot')

        results = process_two_files(ref_path, usr_path, algorithm_params)

        cleanup_temp_files(ref_path, usr_path)

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/process-dance-alignment', methods=['POST'])
@jwt_required()
def process_dance_alignment():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        ref_file_path = data.get('reference_file_path')
        usr_file_path = data.get('user_file_path')
        algorithm_params = data.get('algorithm_params', {})

        if not ref_file_path or not usr_file_path:
            return jsonify({"error": "Both reference_file_path and user_file_path are required"}), 400

        if not os.path.exists(ref_file_path) or not os.path.exists(usr_file_path):
            return jsonify({"error": "One or both files do not exist"}), 404

        results = process_two_files(ref_file_path, usr_file_path, algorithm_params)

        return jsonify(results), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dance-alignment-status', methods=['GET'])
@jwt_required()
def get_dance_alignment_status():
    return jsonify({
        "algorithm_info": {
            "name": "Dance Alignment Analysis",
            "version": "2.0",
            "description": "Analyzes dance performance alignment between reference and user .mot files",
            "supported_formats": [".mot"],
            "parameters": {
                "key_joint": "Joint used for timing analysis (default: hip_flexion_r)",
                "frame_rate": "Frame rate for timing calculations (default: 60)",
                "pose_weight": "Weight for pose error in scoring (default: 0.6)",
                "timing_weight": "Weight for timing lag in scoring (default: 0.3)",
                "smoothness_weight": "Weight for smoothness error in scoring (default: 0.1)"
            }
        },
        "endpoints": [
            "/api/analyze-dance-alignment",
            "/api/process-dance-alignment"
        ],
        "system_status": "operational"
    }), 200

# --- Run the Flask app if this file is executed directly ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)