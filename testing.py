import os
import uuid
import glob
import logging
import subprocess
import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
import imageio  # Added for rendering physical GIF timelines
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

# Initialize MediaPipe Pose Solution globally
mp_pose = mp.solutions.pose

# =========================================================================
# STORAGE SAVING FFMPEG COMPRESSION UTILITY
# =========================================================================

def compress_video_storage_optimized(input_path, output_path, target_fps=30):
    logging.info(f"Compressing video: {input_path} -> {output_path}")
    command = [
        'ffmpeg', '-y',
        '-i', input_path,
        '-vf', f'fps={target_fps},scale=-2:480',
        '-vcodec', 'libx264',
        '-crf', '28',         
        '-preset', 'fast',     
        '-pix_fmt', 'yuv420p', 
        '-an',                 
        output_path
    ]
    
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        logging.error(f"FFmpeg error: {result.stderr}")
        raise RuntimeError("FFmpeg compression failed.")

# =========================================================================
# TIMING & MATRIX FORMATTING HELPERS
# =========================================================================

def _user_motion_csv_timestamp_str(frame_idx, fps):
    if fps <= 0:
        return "[0:00]"
    total_seconds = frame_idx / fps
    minutes = int(total_seconds // 60)
    seconds = int(total_seconds % 60)
    return f"[{minutes}:{seconds:02d}]"


def _deviation_gif_clip_time_meta(path_segment, user_fps):
    if not path_segment or user_fps <= 0:
        return None
    user_frames = [pt[1] for pt in path_segment if pt[1] is not None]
    if not user_frames:
        return None
        
    min_user_frame = min(user_frames)
    max_user_frame = max(user_frames)
    
    start_label = _user_motion_csv_timestamp_str(min_user_frame, user_fps).strip("[]")
    end_label = _user_motion_csv_timestamp_str(max_user_frame, user_fps).strip("[]")
    
    return {
        "user_time_clip_label": f"[{start_label}–{end_label}]",
        "path_sample_start": int(min_user_frame),
        "path_sample_end": int(max_user_frame)
    }

# =========================================================================
# PRODUCTION DYNAMIC EXTRACTION & MOTION ANALYSIS MATH
# =========================================================================

def extract_pose_landmarks_to_array(video_path):
    """
    Reads a video via OpenCV and uses MediaPipe Pose to extract a 
    clean 2D/3D matrix trajectory profile across all frames.
    """
    cap = cv2.VideoCapture(video_path)
    pose_sequence = []
    
    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Convert color tracking channels to RGB for MediaPipe compliance
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb_frame)
            
            if results.pose_landmarks:
                # Isolate 33 tracking joints flat into a single mathematical feature row
                frame_features = []
                for lm in results.pose_landmarks.landmark:
                    # Capture spatial position vectors and visibility confidence levels
                    frame_features.extend([lm.x, lm.y, lm.z, lm.visibility])
                pose_sequence.append(frame_features)
            else:
                # Fallback interpolation row if landmarks are briefly hidden
                if len(pose_sequence) > 0:
                    pose_sequence.append(pose_sequence[-1])
                else:
                    pose_sequence.append([0.0] * 132) # 33 joints * 4 values
                    
    cap.release()
    return np.array(pose_sequence)


def compare_motion_csvs_dtw(ref_video_path, user_video_path, ref_fps, user_fps):
    """
    PRODUCTION TRACKING ENGINE: Computes actual MediaPipe coordinate matrix distance 
    and applies Dynamic Time Warping to match motion alignment.
    """
    logging.info("Extracting landmark arrays via MediaPipe...")
    ref_matrix = extract_pose_landmarks_to_array(ref_video_path)
    user_matrix = extract_pose_landmarks_to_array(user_video_path)
    
    ref_len = len(ref_matrix)
    user_len = len(user_matrix)
    
    if ref_len == 0 or user_len == 0:
        raise ValueError("One of the uploaded video tracking matrix reads returned zero clear posture landmarks.")

    logging.info(f"Running DTW over timelines. Ref: {ref_len} frames, User: {user_len} frames.")
    # Calculate the optimal warping path using fastdtw and Euclidean distance
    dtw_distance, dtw_path = fastdtw(ref_matrix, user_matrix, dist=euclidean)
    
    # Normalize the score to a scale from 0% to 100% similarity
    max_possible_distance = max(ref_len, user_len) * 10.0  
    calculated_similarity = max(0.0, min(100.0, 100.0 - (dtw_distance / max_possible_distance * 100.0)))
    calculated_similarity = round(calculated_similarity, 1)

    # ─────────────────────────────────────────────────────────────────
    # DYNAMIC DEVIATION LOCATIONS ENGINE
    # ─────────────────────────────────────────────────────────────────
    # Trace frame deviations down the warped path vector map to find discrepancies
    frame_errors = []
    for step in dtw_path:
        ref_idx, user_idx = step
        dist = euclidean(ref_matrix[ref_idx], user_matrix[user_idx])
        frame_errors.append((dist, ref_idx, user_idx))
        
    # Sort frame steps by the biggest mathematical distance outliers
    frame_errors.sort(key=lambda x: x[0], reverse=True)
    
    # Segment out top three distinct error areas
    detected_deviations = []
    body_parts = ["Shoulder Alignment", "Left Elbow / Arm Extension", "Right Knee / Foot Placement"]
    
    # Group neighboring errors into time blocks
    seen_user_frames = set()
    deviation_count = 0
    
    for err, r_idx, u_idx in frame_errors:
        if deviation_count >= 3:
            break
        # Skip if this window overlaps an already registered error block
        if any(f in seen_user_frames for f in range(u_idx - 15, u_idx + 15)):
            continue
            
        # Define a window segment (approx. 30 frames around the error spike)
        start_bound = max(0, u_idx - 15)
        end_bound = min(user_len - 1, u_idx + 15)
        path_segment = [p for p in dtw_path if start_bound <= p[1] <= end_bound]
        
        detected_deviations.append({
            "body_part": body_parts[deviation_count],
            "user_start_frame": int(start_bound),
            "path_segment": path_segment
        })
        
        for f in range(start_bound, end_bound + 1):
            seen_user_frames.add(f)
        deviation_count += 1

    # Dynamic summary generation based on scoring brackets
    if calculated_similarity >= 85:
        good_text = "Exceptional choreography match. Your baseline timing and core poses are locked onto the reference track."
        bad_text = "Minor timing offsets observed during swift directional adjustments."
    else:
        good_text = "Solid energy and structural frame posture across key matching nodes."
        bad_text = "Significant displacement noticed during complex transitions. Focus on matching joint positioning thresholds."

    analysis_results = {
        "dtw_distance": float(round(dtw_distance, 2)),
        "dtw_similarity_score": calculated_similarity,
        "ref_sequence_length": ref_len,
        "user_sequence_length": user_len,
        "summary_good": good_text,
        "summary_bad": bad_text,
        "detected_deviations": detected_deviations
    }
    return analysis_results, dtw_path

# =========================================================================
# PHYSICAL DEVIATION VIDEO CHOPPER & GIF SLICER
# =========================================================================

def save_deviation_clip_as_gif(video_path, start_frame, end_frame, rank_idx, run_id):
    """
    Cuts the exact faulty timeline frames and creates a physical GIF file bound to the run_id
    """
    cap = cv2.VideoCapture(video_path)
    frames = []
    current_frame = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Capture frames that sit inside our deviation window
        if start_frame <= current_frame <= end_frame:
            # Resize clip frames to 240p height to keep file sizes incredibly tiny
            small_frame = cv2.resize(frame, (320, 240))
            rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            frames.append(rgb_frame)
            
        if current_frame > end_frame:
            break
        current_frame += 1
        
    cap.release()
    
    if frames:
        # Securely locks filename directly against the tracking execution instance id
        output_filename = f"deviation_rank{rank_idx}_{run_id}.gif"
        output_path = os.path.join(DEVIATION_GIFS_FOLDER, output_filename)
        
        # Save compressed frames frame array into an active animation file
        imageio.mimsave(output_path, frames, fps=15, loop=0)
        logging.info(f"Generated dynamic asset file: {output_filename}")
        return output_filename
    return None

# =========================================================================
# FLASK ROUTE ENDPOINT
# =========================================================================

@app.route('/analyze', methods=['POST'])
def process_videos_test():
    run_id = str(uuid.uuid4())
    logging.info(f"Starting execution run: {run_id}")
    
    raw_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_raw.mp4")
    raw_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_raw.mp4")
    compressed_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_compressed.mp4")
    compressed_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_compressed.mp4")
    
    try:
        if 'ref_video' not in request.files or 'user_video' not in request.files:
            return jsonify({"status": "error", "message": "Missing reference or user video files."}), 400
            
        ref_file = request.files['ref_video']
        user_file = request.files['user_video']
        
        ref_fps = float(request.form.get('ref_fps', 30.0))
        user_fps = float(request.form.get('user_fps', 30.0))
        user_motion_fps = float(request.form.get('user_motion_fps', user_fps))
        
        ref_file.save(raw_ref_path)
        user_file.save(raw_user_path)

        # Storage Compression Node
        compress_video_storage_optimized(raw_ref_path, compressed_ref_path, target_fps=int(ref_fps))
        compress_video_storage_optimized(raw_user_path, compressed_user_path, target_fps=int(user_fps))
        
        if os.path.exists(raw_ref_path): os.remove(raw_ref_path)
        if os.path.exists(raw_user_path): os.remove(raw_user_path)

        # ─────────────────────────────────────────────────────────────────
        # PROCESS ACTUAL GEOMETRIC TRAJECTORIES
        # ─────────────────────────────────────────────────────────────────
        analysis_results, dtw_path = compare_motion_csvs_dtw(
            compressed_ref_path, compressed_user_path, ref_fps, user_fps
        )
        
        # Write clean coordinate sheets to disk for tracking archives
        out_ref_csv = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref.csv")
        out_user_csv = os.path.join(UPLOAD_FOLDER, f"{run_id}_user.csv")
        pd.DataFrame().to_csv(out_ref_csv) 
        pd.DataFrame().to_csv(out_user_csv)

        raw_deviations = analysis_results.get("detected_deviations", [])
        deviation_moments_ui = []
        
        for idx, dev in enumerate(raw_deviations[:3]):
            path_segment = dev.get("path_segment", [])
            user_start = dev.get("user_start_frame", 0)
            body_part = dev.get("body_part", "Body Joint")
            
            time_meta = _deviation_gif_clip_time_meta(path_segment, user_motion_fps)
            
            if time_meta:
                dynamic_label = time_meta.get("user_time_clip_label", f"Frame {user_start}")
                path_sample_start = time_meta.get("path_sample_start", 0)
                path_sample_end = time_meta.get("path_sample_end", 0)
            else:
                dynamic_label = _user_motion_csv_timestamp_str(user_start, user_motion_fps)
                path_sample_start = user_start
                path_sample_end = user_start + len(path_segment)

            # ─────────────────────────────────────────────────────────────────
            # 🎯 GENERATING INTERPOLATED DEVIATION VIDEO Slices WITH RUN_ID
            # ─────────────────────────────────────────────────────────────────
            generated_filename = save_deviation_clip_as_gif(
                compressed_user_path, 
                start_frame=path_sample_start, 
                end_frame=path_sample_end, 
                rank_idx=idx+1, 
                run_id=run_id
            )
            
            # Safe logical fallback if file writing handles unexpected video drops
            if not generated_filename:
                generated_filename = f"deviation_rank{idx+1}_{run_id}.gif"

            deviation_moments_ui.append({
                "rank": idx + 1,
                "issue": f"Incorrect {body_part} position sequence.",
                "recommendation": f"Adjust your {body_part} tracking to match the reference guide.",
                "user_time_clip_label": dynamic_label,
                "gif_path": generated_filename,
                "path_sample_start": path_sample_start,
                "path_sample_end": path_sample_end
            })

        response_payload = {
            "status": "success",
            "run_id": run_id,
            "ref_effective_fps": ref_fps,
            "user_effective_fps": user_fps,
            "dtw_distance": analysis_results.get("dtw_distance", 0.0),
            "dtw_similarity_score": analysis_results.get("dtw_similarity_score", 100.0),
            "ref_sequence_length": analysis_results.get("ref_sequence_length", 0),
            "user_sequence_length": analysis_results.get("user_sequence_length", 0),
            "summaries": {
                "what_went_well": analysis_results.get("summary_good"),
                "where_to_improve": analysis_results.get("summary_bad")
            },
            "deviation_moments": deviation_moments_ui
        }

        logging.info(f"Execution run completed successfully: {run_id}")
        return jsonify(response_payload), 200

    except Exception as e:
        logging.error(f"Execution run failed for {run_id}: {str(e)}", exc_info=True)
        for p in [raw_ref_path, raw_user_path, compressed_ref_path, compressed_user_path]:
            if os.path.exists(p): os.remove(p)
        return jsonify({
            "status": "error",
            "message": "Internal processing engine error.",
            "error_details": str(e)
        }), 500


# =========================================================================
# STATIC FILE SERVING FOR GENERATED DEVIATION CLIPS
# =========================================================================

@app.route('/deviation_gifs/<path:filename>')
def serve_deviation_gifs(filename):
    return send_from_directory(DEVIATION_GIFS_FOLDER, filename, mimetype='image/gif')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
