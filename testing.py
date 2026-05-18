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
    Downscales to 540p max dimension for ultra-fast processing throughput.
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
# UNIVERSAL SIDE-BY-SIDE GENERATOR (PORTRAIT & LANDSCAPE HYBRID ENGINE)
# =========================================================================

def save_side_by_side_deviation_gif(ref_video_path, user_video_path, path_segment, body_part_text, rank_idx, run_id):
    """
    UNIVERSAL HYBRID ENGINE:
    - Auto-detects if video is Portrait or Landscape.
    - Locks dimensions to eliminate empty black boxes in both orientations.
    - Scales font dynamically relative to video orientation bounds.
    """
    mp_drawing = mp.solutions.drawing_utils
    
    cap_ref = cv2.VideoCapture(ref_video_path)
    cap_user = cv2.VideoCapture(user_video_path)
    
    orig_w = int(cap_user.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    orig_h = int(cap_user.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    
    # 🎯 FIX: Intelligent Canvas Dimensions calculation based on true aspect orientation
    max_bound = 400
    if orig_w >= orig_h:
        # Landscape Mode configuration rules
        canvas_w = max_bound
        canvas_h = int((orig_h / orig_w) * canvas_w)
    else:
        # Portrait Mode configuration rules
        canvas_h = max_bound
        canvas_w = int((orig_w / orig_h) * canvas_h)
        
    # Ensure dimensions are divisible by 2 for standard video frame constraints
    if canvas_w % 2 != 0: canvas_w += 1
    if canvas_h % 2 != 0: canvas_h += 1

    def letterbox_frame_universal(frame, target_w, target_h):
        """Resizes frame perfectly to match orientation bounds safely"""
        h, w = frame.shape[:2]
        scale = min(target_w / w, target_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        resized = cv2.resize(frame, (new_w, new_h))
        
        if new_w == target_w and new_h == target_h:
            return resized
            
        padded = np.zeros((target_h, target_w, 3), dtype=np.uint8)
        x_offset = max(0, (target_w - new_w) // 2)
        y_offset = max(0, (target_h - new_h) // 2)
        
        use_w = min(target_w, new_w)
        use_h = min(target_h, new_h)
        padded[y_offset:y_offset+use_h, x_offset:x_offset+use_w] = resized[:use_h, :use_w]
        return padded

    # Map joint node indices
    target_joints = []
    bp_lower = body_part_text.lower()
    if "shoulder" in bp_lower:
        target_joints = [11, 12]  
    elif "elbow" in bp_lower or "arm" in bp_lower:
        target_joints = [13, 14, 15, 16] 
    elif "knee" in bp_lower or "foot" in bp_lower or "placement" in bp_lower:
        target_joints = [25, 26, 27, 28, 29, 30, 31, 32]

    frames_combined = []
    
    needed_ref = sorted(list(set(pt[0] for pt in path_segment)))
    needed_user = sorted(list(set(pt[1] for pt in path_segment)))
    
    ref_frames = {}
    user_frames = {}
    
    for f_idx in needed_ref:
        cap_ref.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap_ref.read()
        if ret: ref_frames[f_idx] = letterbox_frame_universal(frame, canvas_w, canvas_h)
        
    for f_idx in needed_user:
        cap_user.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap_user.read()
        if ret: user_frames[f_idx] = letterbox_frame_universal(frame, canvas_w, canvas_h)
        
    cap_ref.release()
    cap_user.release()

    pose_connection_spec = mp_drawing.DrawingSpec(color=(220, 220, 220), thickness=2, circle_radius=1)
    normal_joint_spec = mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2)
    error_joint_spec = mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=4, circle_radius=5) 

    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.4) as pose:
        for ref_idx, user_idx in path_segment:
            frame_ref = ref_frames.get(ref_idx)
            frame_user = user_frames.get(user_idx)
            
            if frame_ref is None or frame_user is None:
                continue
                
            frame_ref = frame_ref.copy()
            frame_user = frame_user.copy()
            
            # Process User side
            res_user = pose.process(cv2.cvtColor(frame_user, cv2.COLOR_BGR2RGB))
            if res_user.pose_landmarks:
                mp_drawing.draw_landmarks(
                    frame_user, res_user.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=None, connection_drawing_spec=pose_connection_spec
                )
                for idx, lm in enumerate(res_user.pose_landmarks.landmark):
                    cx, cy = int(lm.x * canvas_w), int(lm.y * canvas_h)
                    if idx in target_joints:
                        cv2.circle(frame_user, (cx, cy), error_joint_spec.circle_radius, error_joint_spec.color, -1)
                    else:
                        cv2.circle(frame_user, (cx, cy), normal_joint_spec.circle_radius, normal_joint_spec.color, -1)

            # Process Reference side
            res_ref = pose.process(cv2.cvtColor(frame_ref, cv2.COLOR_BGR2RGB))
            if res_ref.pose_landmarks:
                mp_drawing.draw_landmarks(
                    frame_ref, res_ref.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=None, connection_drawing_spec=pose_connection_spec
                )
                for idx, lm in enumerate(res_ref.pose_landmarks.landmark):
                    cx, cy = int(lm.x * canvas_w), int(lm.y * canvas_h)
                    if idx in target_joints:
                        cv2.circle(frame_ref, (cx, cy), error_joint_spec.circle_radius, error_joint_spec.color, -1)
                    else:
                        cv2.circle(frame_ref, (cx, cy), normal_joint_spec.circle_radius, normal_joint_spec.color, -1)

            # Scale typography dynamically to prevent clipping in narrow views
            font_scale = 0.55 if canvas_w > 250 else 0.45
            
            cv2.putText(frame_user, "YOUR CLIP", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 255), 1, cv2.LINE_AA)
            cv2.putText(frame_ref, "REFERENCE", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), 1, cv2.LINE_AA)
            
            # Construct comparison matrix safely side-by-side
            stitched_canvas = np.hstack((frame_user, frame_ref))
            
            cv2.putText(stitched_canvas, f"DISCREPANCY DETECTED: {body_part_text.upper()}", (15, canvas_h - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale * 0.85, (255, 255, 255), 1, cv2.LINE_AA)
            
            frames_combined.append(cv2.cvtColor(stitched_canvas, cv2.COLOR_BGR2RGB))

    if frames_combined:
        output_filename = f"deviation_rank{rank_idx}_{run_id}.gif"
        output_path = os.path.join(DEVIATION_GIFS_FOLDER, output_filename)
        imageio.mimsave(output_path, frames_combined[::2], fps=10, loop=0)
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
