import os
import uuid
import glob
import logging
import subprocess
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

# =========================================================================
# CONFIGURATIONS & STORAGE CONSTANTS
# =========================================================================
UPLOAD_FOLDER = "./uploads"
OUTPUT_FOLDER = "./output"
LOG_FOLDER = "./logs"
DEVIATION_GIFS_FOLDER = "./deviation_gifs"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)
os.makedirs(DEVIATION_GIFS_FOLDER, exist_ok=True)

logging.basicConfig(
    level=logging.INFO, 
    filename=os.path.join(LOG_FOLDER, "app.log"),
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# =========================================================================
# STORAGE SAVING FFMPEG COMPRESSION UTILITY
# =========================================================================

def compress_video_storage_optimized(input_path, output_path, target_fps=30):
    """
    Uses FFmpeg to heavily compress incoming videos. 
    Drops resolution to 480p height and uses high compression (CRF 28) 
    to maximize disk space savings for 1-minute videos.
    """
    logging.info(f"Compressing video: {input_path} -> {output_path}")
    command = [
        'ffmpeg', '-y',
        '-i', input_path,
        # Force 30fps for stable DTW math, scale down to 480p vertical resolution
        '-vf', f'fps={target_fps},scale=-2:480',
        '-vcodec', 'libx264',
        '-crf', '28',         # 28 provides highly efficient compression while retaining pose clarity
        '-preset', 'fast',     # Quick processing speed to keep API responses snappy
        '-pix_fmt', 'yuv420p', # Maximizes compatibility with OpenCV/MediaPipe
        '-an',                 # Strip audio tracking entirely to save even more space
        output_path
    ]
    
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        logging.error(f"FFmpeg error: {result.stderr}")
        raise RuntimeError("FFmpeg compression failed.")

# =========================================================================
# ORIGINAL TIME-MAPPING & ANALYSIS UTILITIES
# =========================================================================

def _user_motion_csv_timestamp_str(frame_idx, fps):
    if fps <= 0:
        return "[0:00]"
    total_seconds = frame_idx / fps
    minutes = int(total_seconds // 60)
    seconds = int(total_seconds % 60)
    return f"[{minutes}:{seconds:02d}]"


def _deviation_gif_clip_time_meta(path_segment, user_start_frame, user_fps):
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


def compare_motion_csvs_dtw(ref_csv_path, user_csv_path, ref_fps, user_fps):
    """
    Simulated DTW analysis engine. Replace this internal mock data logic 
    with your actual MediaPipe coordinate matrix distance logic.
    """
    ref_len = 1800 if ref_fps == 30 else 3600  # Default scale fallback for a 1-min clip
    user_len = 1800 if user_fps == 30 else 3600
    
    simulated_distance = 12.4
    simulated_similarity = 88.5
    
    dtw_path = []
    max_steps = max(ref_len, user_len)
    for i in range(max_steps):
        dtw_path.append((min(i, ref_len - 1), min(i, user_len - 1)))

    detected_deviations = [
        {"body_part": "Left Elbow", "user_start_frame": int(user_fps * 5), "path_segment": dtw_path[150:240]},
        {"body_part": "Right Knee", "user_start_frame": int(user_fps * 22), "path_segment": dtw_path[660:750]},
        {"body_part": "Shoulder Alignment", "user_start_frame": int(user_fps * 45), "path_segment": dtw_path[1350:1440]}
    ]

    analysis_results = {
        "dtw_distance": simulated_distance,
        "dtw_similarity_score": simulated_similarity,
        "ref_sequence_length": ref_len,
        "user_sequence_length": user_len,
        "summary_good": "Excellent coordination during the intro segments.",
        "summary_bad": "Slight balance lagging seen mid-way through the session.",
        "detected_deviations": detected_deviations
    }
    return analysis_results, dtw_path

# =========================================================================
# FLASK ROUTE ENDPOINT
# =========================================================================

@app.route('/analyze', methods=['POST'])
def process_videos_test():
    run_id = str(uuid.uuid4())
    logging.info(f"Starting execution run: {run_id}")
    
    # Path initializations
    raw_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_raw.mp4")
    raw_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_raw.mp4")
    compressed_ref_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref_compressed.mp4")
    compressed_user_path = os.path.join(UPLOAD_FOLDER, f"{run_id}_user_compressed.mp4")
    
    try:
        # 1. Accept Video Uploads from Frontend
        if 'ref_video' not in request.files or 'user_video' not in request.files:
            return jsonify({"status": "error", "message": "Missing reference or user video files."}), 400
            
        ref_file = request.files['ref_video']
        user_file = request.files['user_video']
        
        ref_fps = float(request.form.get('ref_fps', 30.0))
        user_fps = float(request.form.get('user_fps', 30.0))
        user_motion_fps = float(request.form.get('user_motion_fps', user_fps))
        
        # Save heavy raw uploads temporarily
        ref_file.save(raw_ref_path)
        user_file.save(raw_user_path)

        # 2. Storage Optimization Step: Compress immediately
        compress_video_storage_optimized(raw_ref_path, compressed_ref_path, target_fps=int(ref_fps))
        compress_video_storage_optimized(raw_user_path, compressed_user_path, target_fps=int(user_fps))
        
        # HOUSEKEEPING: Delete raw heavy files instantly to keep disk clean!
        if os.path.exists(raw_ref_path): os.remove(raw_ref_path)
        if os.path.exists(raw_user_path): os.remove(raw_user_path)

        # Note: In your full production setup, you would now pass `compressed_user_path` 
        # into MediaPipe to extract coordinates to CSV. For this test endpoint, 
        # we generate simulated paths to keep verification swift.
        out_ref_csv = os.path.join(UPLOAD_FOLDER, f"{run_id}_ref.csv")
        out_user_csv = os.path.join(UPLOAD_FOLDER, f"{run_id}_user.csv")
        pd.DataFrame().to_csv(out_ref_csv) # Placeholder tracking targets
        pd.DataFrame().to_csv(out_user_csv)

        # 3. Dynamic Alignment Analysis Logic
        analysis_results, dtw_path = compare_motion_csvs_dtw(out_ref_csv, out_user_csv, ref_fps, user_fps)
        
        raw_deviations = analysis_results.get("detected_deviations", [])
        deviation_moments_ui = []
        
        for idx, dev in enumerate(raw_deviations[:3]):
            path_segment = dev.get("path_segment", [])
            user_start = dev.get("user_start_frame", 0)
            body_part = dev.get("body_part", "Body Joint")
            
            time_meta = _deviation_gif_clip_time_meta(path_segment, user_start, user_motion_fps)
            
            if time_meta:
                dynamic_label = time_meta.get("user_time_clip_label", f"Frame {user_start}")
                path_sample_start = time_meta.get("path_sample_start", 0)
                path_sample_end = time_meta.get("path_sample_end", 0)
            else:
                dynamic_label = _user_motion_csv_timestamp_str(user_start, user_motion_fps)
                path_sample_start = user_start
                path_sample_end = user_start + len(path_segment)

            gif_filename = f"{run_id}_dev_{idx+1}.gif"
            gif_path = f"https://danceperfect.duckdns.org/deviation_gifs/{gif_filename}"
            
            deviation_moments_ui.append({
                "rank": idx + 1,
                "issue": f"Incorrect {body_part} position sequence.",
                "recommendation": f"Adjust your {body_part} tracking to match the reference guide.",
                "user_time_clip_label": dynamic_label,
                "gif_path": gif_path,
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
        # Clean up files on error so storage doesn't leak
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
    """
    🎯 FIXED: Safely intercepts browser asset inquiries targeting DuckDNS
    and pipes requested .gif streams straight out of local disk storage.
    """
    gifs_directory = os.path.join(os.getcwd(), 'deviation_gifs')
    return send_from_directory(gifs_directory, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
