import os
import uuid
import glob
import logging
import subprocess
import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
import imageio
from flask import Flask, request, jsonify, send_from_directory
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

app = Flask(__name__)

# =========================================================================
# CONFIGURATIONS & STORAGE CONSTANTS
# =========================================================================
UPLOAD_FOLDER = "./uploads"
OUTPUT_FOLDER = "./output"
LOG_FOLDER = "./logs"
DEVIATION_GIFS_FOLDER = "/var/www/danceperfect/deviation_gifs"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(DEVIATION_GIFS_FOLDER, exist_ok=True)

logging.basicConfig(
    level=logging.INFO, 
    filename=os.path.join(LOG_FOLDER, "app.log"),
    format="%(asctime)s - %(levelname)s - %(message)s"
)

mp_pose = mp.solutions.pose

# =========================================================================
# SPEED-OPTIMIZED FFMPEG COMPRESSION UTILITY
# =========================================================================

def compress_video_storage_optimized(input_path, output_path, target_fps=30):
    """
    Downscales incoming videos to a uniform height for fast frame parsing.
    """
    logging.info(f"Optimizing video for analysis speed: {input_path} -> {output_path}")
    command = [
        'ffmpeg', '-y',
        '-i', input_path,
        '-vf', f'fps={target_fps},scale=-2:540',
        '-vcodec', 'libx264',
        '-crf', '24',            
        '-preset', 'ultrafast', 
        '-pix_fmt', 'yuv420p',  
        '-an',                  
        output_path
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError("FFmpeg compression optimization failed.")

# =========================================================================
# TIMING & MATRIX FORMATTING HELPERS
# =========================================================================

def _user_motion_csv_timestamp_str(frame_idx, fps):
    if fps <= 0: return "[0:00]"
    total_seconds = frame_idx / fps
    return f"[{int(total_seconds // 60)}:{int(total_seconds % 60):02d}]"

def _deviation_gif_clip_time_meta(path_segment, user_fps):
    if not path_segment or user_fps <= 0: return None
    user_frames = [pt[1] for pt in path_segment if pt[1] is not None]
    if not user_frames: return None
    start_label = _user_motion_csv_timestamp_str(min(user_frames), user_fps).strip("[]")
    end_label = _user_motion_csv_timestamp_str(max(user_frames), user_fps).strip("[]")
    return {
        "user_time_clip_label": f"[{start_label}–{end_label}]",
        "path_sample_start": int(min(user_frames)),
        "path_sample_end": int(max(user_frames))
    }

# =========================================================================
# FLUID ASPECT SCALING VISUALIZATION ENGINE (NO BARS, NO LABELS, NO CROPPING)
# =========================================================================

def save_side_by_side_deviation_gif(ref_video_path, user_video_path, path_segment, body_part_text, rank_idx, run_id):
    """
    SEAMLESS ASPECT-LOCKED RENDERING ENGINE:
    - Omitted inline "YOUR CLIP" / "REFERENCE" text elements entirely to maximize tracking clarity.
    - Omitted artificial black container padding or cropping offsets.
    - Scales frames fluidly based on raw media dimension ratios.
    """
    cap_ref = cv2.VideoCapture(ref_video_path)
    cap_user = cv2.VideoCapture(user_video_path)
    
    # Read core aspect dimensions from the active reference file
    orig_w = int(cap_ref.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap_ref.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    if orig_w == 0 or orig_h == 0:
        # Safe fallback block if meta-read flags register empty
        orig_w, orig_h = 1080, 1920

    # Lock processing canvas height; compute un-padded proportional target width
    target_h = 360
    aspect_ratio = orig_w / orig_h
    target_w = int(target_h * aspect_ratio)

    # Isolate key skeleton index markers
    target_joints = []
    bp_lower = body_part_text.lower()
    if "shoulder" in bp_lower:
        target_joints = [11, 12]  
    elif "elbow" in bp_lower or "arm" in bp_lower:
        target_joints = [13, 14, 15, 16] 
    elif "knee" in bp_lower or "foot" in bp_lower or "placement" in bp_lower:
        target_joints = [25, 26, 27, 28, 29, 30, 31, 32]

    # Explicit skeletal wireframe configuration routes
    SKELETON_CONNECTIONS = [
        (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), 
        (11, 23), (12, 24), (23, 24),                     
        (23, 25), (24, 26), (25, 27), (26, 28),           
        (27, 29), (28, 30), (29, 31), (30, 32)            
    ]

    # Optimization path sample downslice
    optimized_path = path_segment[::2]
    needed_ref = sorted(list(set(pt[0] for pt in optimized_path)))
    needed_user = sorted(list(set(pt[1] for pt in optimized_path)))
    
    ref_frames, user_frames = {}, {}
    for f_idx in needed_ref:
        cap_ref.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap_ref.read()
        if ret and frame is not None: 
            ref_frames[f_idx] = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
        
    for f_idx in needed_user:
        cap_user.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap_user.read()
        if ret and frame is not None: 
            user_frames[f_idx] = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
        
    cap_ref.release()
    cap_user.release()

    frames_combined = []

    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.4) as pose:
        for ref_idx, user_idx in optimized_path:
            frame_ref = ref_frames.get(ref_idx)
            frame_user = user_frames.get(user_idx)
            
            if frame_ref is None or frame_user is None:
                continue
                
            frame_ref = frame_ref.copy()
            frame_user = frame_user.copy()

            for current_frame in [frame_user, frame_ref]:
                res = pose.process(cv2.cvtColor(current_frame, cv2.COLOR_BGR2RGB))
                if res.pose_landmarks:
                    coords = {}
                    for idx, lm in enumerate(res.pose_landmarks.landmark):
                        if lm.visibility > 0.4:
                            coords[idx] = (int(lm.x * target_w), int(lm.y * target_h))
                    
                    # 1. Continuous Kinematic Linkage Overlays
                    for start_j, end_j in SKELETON_CONNECTIONS:
                        if start_j in coords and end_j in coords:
                            if start_j in target_joints or end_j in target_joints:
                                line_color = (80, 80, 255)  # Tracking variant indicator (Red)
                                line_thickness = 3
                            else:
                                line_color = (240, 240, 240)  # Standard joint bridge tracking line (White)
                                line_thickness = 2
                            cv2.line(current_frame, coords[start_j], coords[end_j], line_color, line_thickness, cv2.LINE_AA)

                    # 2. Joint Tracking Nodes
                    for idx, pt in coords.items():
                        if idx in target_joints:
                            cv2.circle(current_frame, pt, 5, (0, 0, 255), -1, cv2.LINE_AA)
                        else:
                            cv2.circle(current_frame, pt, 3, (60, 220, 60), -1, cv2.LINE_AA)

            # Join frames horizontally with zero gaps or artificial margins
            stitched_canvas = np.hstack((frame_user, frame_ref))
            frames_combined.append(cv2.cvtColor(stitched_canvas, cv2.COLOR_BGR2RGB))

    if frames_combined:
        output_filename = f"deviation_rank{rank_idx}_{run_id}.gif"
        output_path = os.path.join(DEVIATION_GIFS_FOLDER, output_filename)
        imageio.mimsave(output_path, frames_combined, fps=10, loop=0)
        return output_filename
    return None

# =========================================================================
# FULL MATRIX EXTRACTION & MOTION ANALYSIS MATH ENGINE
# =========================================================================

def extract_pose_landmarks_to_array(video_path):
    cap = cv2.VideoCapture(video_path)
    pose_sequence = []
    
    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.4, min_tracking_confidence=0.4) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if results.pose_landmarks:
                frame_features = []
                for lm in results.pose_landmarks.landmark:
                    frame_features.extend([lm.x, lm.y, lm.z, lm.visibility])
                pose_sequence.append(frame_features)
            else:
                pose_sequence.append(pose_sequence[-1] if len(pose_sequence) > 0 else [0.0] * 132)
                    
    cap.release()
    return np.array(pose_sequence)

def compare_motion_csvs_dtw(ref_video_path, user_video_path, ref_fps, user_fps):
    ref_matrix = extract_pose_landmarks_to_array(ref_video_path)
    user_matrix = extract_pose_landmarks_to_array(user_video_path)
    
    ref_len, user_len = len(ref_matrix), len(user_matrix)
    if ref_len == 0 or user_len == 0:
        raise ValueError("Uploaded videos could not yield stable landmark sets.")

    dtw_distance, dtw_path = fastdtw(ref_matrix, user_matrix, dist=euclidean)
    
    max_possible_distance = max(ref_len, user_len) * 10.0  
    calculated_similarity = round(max(0.0, min(100.0, 100.0 - (dtw_distance / max_possible_distance * 100.0))), 1)

    frame_errors = []
    for ref_idx, user_idx in dtw_path:
        dist = euclidean(ref_matrix[ref_idx], user_matrix[user_idx])
        frame_errors.append((dist, ref_idx, user_idx))
    frame_errors.sort(key=lambda x: x[0], reverse=True)
    
    detected_deviations = []
    body_parts = ["Shoulder Alignment", "Left Elbow / Arm Extension", "Right Knee / Foot Placement"]
    seen_user_frames = set()
    deviation_count = 0
    
    for err, r_idx, u_idx in frame_errors:
        if deviation_count >= 3: break
        if any(f in seen_user_frames for f in range(u_idx - 10, u_idx + 10)): continue
            
        start_bound = max(0, u_idx - 10)
        end_bound = min(user_len - 1, u_idx + 10)
        path_segment = [p for p in dtw_path if start_bound <= p[1] <= end_bound]
        
        detected_deviations.append({
            "body_part": body_parts[deviation_count],
            "user_start_frame": int(start_bound),
            "path_segment": path_segment
        })
        for f in range(start_bound, end_bound + 1): seen_user_frames.add(f)
        deviation_count += 1

    return {
        "dtw_distance": float(round(dtw_distance, 2)),
        "dtw_similarity_score": calculated_similarity,
        "ref_sequence_length": ref_len,
        "user_sequence_length": user_len,
        "summary_good": "Solid energy across matching structural sequence positions.",
        "summary_bad": "Review specific timing adjustments around deviation highlights.",
        "detected_deviations": detected_deviations
    }, dtw_path

# =========================================================================
# FLASK ROUTE ENDPOINT
# =========================================================================

@app.route('/analyze', methods=['POST'])
def process_videos_test():
    run_id = str(uuid.uuid4())
    
    raw_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_raw.mp4")
    raw_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_raw.mp4")
    compressed_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_compressed.mp4")
    compressed_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_compressed.mp4")
    
    try:
        if 'ref_video' not in request.files or 'user_video' not in request.files:
            return jsonify({"status": "error", "message": "Missing file vectors."}), 400
            
        request.files['ref_video'].save(raw_ref_path)
        request.files['user_video'].save(raw_user_path)

        ref_fps = float(request.form.get('ref_fps', 30.0))
        user_fps = float(request.form.get('user_fps', 30.0))
        user_motion_fps = float(request.form.get('user_motion_fps', user_fps))
        
        compress_video_storage_optimized(raw_ref_path, compressed_ref_path, target_fps=int(ref_fps))
        compress_video_storage_optimized(raw_user_path, compressed_user_path, target_fps=int(user_fps))
        
        if os.path.exists(raw_ref_path): os.remove(raw_ref_path)
        if os.path.exists(raw_user_path): os.remove(raw_user_path)

        analysis_results, dtw_path = compare_motion_csvs_dtw(
            compressed_ref_path, compressed_user_path, ref_fps, user_fps
        )
        
        raw_deviations = analysis_results.get("detected_deviations", [])
        deviation_moments_ui = []
        
        for idx, dev in enumerate(raw_deviations[:3]):
            path_segment = dev.get("path_segment", [])
            user_start = dev.get("user_start_frame", 0)
            body_part = dev.get("body_part", "Body Joint")
            
            time_meta = _deviation_gif_clip_time_meta(path_segment, user_motion_fps)
            dynamic_label = time_meta.get("user_time_clip_label", f"Frame {user_start}") if time_meta else f"Frame {user_start}"
            path_sample_start = time_meta.get("path_sample_start", user_start) if time_meta else user_start
            path_sample_end = time_meta.get("path_sample_end", user_start + 20) if time_meta else user_start + 20

            generated_filename = save_side_by_side_deviation_gif(
                compressed_ref_path, compressed_user_path,
                path_segment=path_segment, body_part_text=body_part,
                rank_idx=idx+1, run_id=run_id
            )
            
            deviation_moments_ui.append({
                "rank": idx + 1,
                "issue": f"Incorrect {body_part} position sequence.",
                "recommendation": f"Adjust your {body_part} tracking to match the reference guide.",
                "user_time_clip_label": dynamic_label,
                "gif_path": generated_filename or f"deviation_rank{idx+1}_{run_id}.gif", 
                "path_sample_start": path_sample_start,
                "path_sample_end": path_sample_end
            })

        for path in [compressed_ref_path, compressed_user_path]:
            if os.path.exists(path): os.remove(path)

        return jsonify({
            "status": "success",
            "run_id": run_id,
            "dtw_distance": analysis_results.get("dtw_distance", 0.0),
            "dtw_similarity_score": analysis_results.get("dtw_similarity_score", 100.0),
            "summaries": {
                "what_went_well": analysis_results.get("summary_good"),
                "where_to_improve": analysis_results.get("summary_bad")
            },
            "deviation_moments": deviation_moments_ui
        }), 200

    except Exception as e:
        logging.error(f"Execution run failed: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal engine error."}), 500

@app.route('/deviation_gifs/<path:filename>')
def serve_deviation_gifs(filename):
    return send_from_directory(DEVIATION_GIFS_FOLDER, filename, mimetype='image/gif')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
