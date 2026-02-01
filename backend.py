# backend.py

# --- Imports: Flask for web server, CORS for cross-origin, Supabase for DB, dotenv for env vars, bcrypt for hashing, os for env access, JWT for tokens ---
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import os

# --- COMPUTATIONAL ALGORITHM IMPORTS ---
import tempfile
import uuid
import pandas as pd
import numpy as np
from scipy.signal import correlate
import json
# --- MediaPipe / video processing (used in MEDIAPIPE INTEGRATION section below) ---
import cv2
import mediapipe as mp

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

# --- Route: Test database connection ---
@app.route('/test-connection')
def test_connection():
    try:
        # Try to fetch one user from the users table
        response = supabase.table("users").select("*").limit(1).execute()
        return jsonify({"data": response.data, "message": "Database connection successful"})
    except Exception as e:
        # Return error if connection fails
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
    # Parse JSON data from request
    data = request.get_json()  # Use get_json() instead of .json
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    email = data.get("email")
    password = data.get("password")
    
    # Debug: Print received credentials (remove this in production!)
    #frontend
    print(f"Received registration attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    # Validate input
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Check if user already exists in the database
    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    # Hash the password securely
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Insert new user into Supabase users table
    try:
        response = supabase.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "role": "user"
        }).execute()
        
        return jsonify({"message": "User registered successfully"}), 201
        
    except Exception as e:
        # Return error if insertion fails
        return jsonify({"error": str(e)}), 500

# --- Route: User login endpoint ---
@app.route('/login', methods=['POST'])
def login():
    # Parse JSON data from request
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    email = data.get("email")
    password = data.get("password")
    
    # Debug: Print received credentials (remove this in production!)
    print(f"Received login attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    # Validate input
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Find user in database
    try:
        response = supabase.table("users").select("*").eq("email", email).execute()
        
        if not response.data:
            return jsonify({"error": "Invalid email or password"}), 401
        
        user = response.data[0] 
        stored_password_hash = user.get("password_hash")
        
        # Check if password hash exists
        if not stored_password_hash:
            return jsonify({"error": "Invalid email or password"}), 401
        
        # Verify password
        if bcrypt.checkpw(password.encode('utf-8'), stored_password_hash.encode('utf-8')):
            # Password is correct - create JWT token
            access_token = create_access_token(identity=user.get("id"))
            
            # Return user info and token (excluding password hash)
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
        # Return error if database query fails
        return jsonify({"error": str(e)}), 500

# --- Route: Protected endpoint that requires JWT token ---
@app.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    # Get the current user's ID from the JWT token
    current_user_id = get_jwt_identity()
    
    try:
        # Fetch user data from database
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
# DANCE ALIGNMENT ALGORITHM SECTION
# ================================================================================================
# This section contains the dance alignment algorithm for analyzing .mot files
# ================================================================================================

# --- DANCE ALIGNMENT ALGORITHM HELPER FUNCTIONS ---
def save_uploaded_file(file_data, file_extension=".tmp"):
    """
    Save uploaded file data to temporary storage
    Returns the file path for processing
    """
    # Generate unique filename
    filename = f"upload_{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(tempfile.gettempdir(), filename)
    
    # Write file data
    with open(file_path, 'wb') as f:
        f.write(file_data)
    
    return file_path

def cleanup_temp_files(*file_paths):
    """
    Clean up temporary files after processing
    """
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Warning: Could not delete temp file {file_path}: {e}")

def read_mot_file(file_path):
    """Reads a .mot file and returns a pandas DataFrame."""
    with open(file_path) as f:
        lines = f.readlines()
    start_index = next(i for i, line in enumerate(lines) if line.strip().startswith("time"))
    df = pd.read_csv(file_path, sep=r'\s+', skiprows=start_index)
    return df

def interpolate_to_match(ref, usr):
    """Align user file to match reference time base via interpolation."""
    usr_interp = usr.set_index('time').reindex(ref['time']).interpolate().reset_index()
    return usr_interp

def compute_pose_error(ref_motion, usr_motion):
    """Compute average pose error (mean absolute joint difference)."""
    diff = np.abs(ref_motion.values - usr_motion.values)
    pose_error = np.mean(diff)
    return pose_error

def compute_timing_lag(ref_motion, usr_motion, key_joint='hip_flexion_r', frame_rate=60):
    """Estimate timing lag using cross-correlation of a key joint."""
    if key_joint not in ref_motion.columns or key_joint not in usr_motion.columns:
        return 0.0
    ref_signal = ref_motion[key_joint] - ref_motion[key_joint].mean()
    usr_signal = usr_motion[key_joint] - usr_motion[key_joint].mean()
    corr = correlate(usr_signal, ref_signal, mode='full')
    lag = np.argmax(corr) - (len(ref_signal) - 1)
    lag_seconds = lag / frame_rate
    return lag_seconds

def compute_smoothness_error(motion):
    """Compute smoothness as the standard deviation of frame-to-frame velocity."""
    velocity = np.diff(motion.values, axis=0)
    smoothness_error = np.std(velocity)
    return smoothness_error

def compute_alignment_score(pose_error, timing_lag, smoothness_error,
                            w1=0.6, w2=0.3, w3=0.1):
    """Combine metrics into a weighted alignment score (0-100)."""
    # Normalize components to reasonable ranges
    pose_penalty = min(pose_error * 100, 100)
    timing_penalty = min(abs(timing_lag) * 10, 100)
    smoothness_penalty = min(smoothness_error * 50, 100)

    total_penalty = (w1 * pose_penalty) + (w2 * timing_penalty) + (w3 * smoothness_penalty)
    score = max(0, 100 - total_penalty)
    return score

def analyze_dance_alignment(ref_file, usr_file):
    """Main function to compute alignment metrics between two .mot files."""
    # Load data
    ref = read_mot_file(ref_file)
    usr = read_mot_file(usr_file)

    # Interpolate user data to reference timeline
    usr_interp = interpolate_to_match(ref, usr)

    # Drop time columns for comparison
    ref_motion = ref.drop(columns=['time'])
    usr_motion = usr_interp.drop(columns=['time'])

    # Compute metrics
    pose_error = compute_pose_error(ref_motion, usr_motion)
    timing_lag = compute_timing_lag(ref_motion, usr_motion)
    smoothness_error = compute_smoothness_error(usr_motion)
    score = compute_alignment_score(pose_error, timing_lag, smoothness_error)

    # Feedback generation
    if score > 90:
        feedback = "Excellent synchronization! Very close to the reference."
    elif score > 75:
        feedback = "Good performance. Slight timing or pose variations."
    elif score > 60:
        feedback = "Average alignment. Noticeable deviations in movement."
    else:
        feedback = "Needs improvement. Large misalignment detected."

    # Return results
    result = {
        "pose_error": float(pose_error),
        "timing_lag_seconds": float(timing_lag),
        "smoothness_error": float(smoothness_error),
        "alignment_score": round(score, 2),
        "feedback": feedback
    }

    return result

# --- DANCE ALIGNMENT ALGORITHM CORE FUNCTION ---
def process_two_files(file1_path, file2_path, algorithm_params=None):
    """
    Main dance alignment algorithm function that processes two .mot files
    
    Args:
        file1_path (str): Path to the reference .mot file
        file2_path (str): Path to the user .mot file
        algorithm_params (dict): Optional parameters for the algorithm
    
    Returns:
        dict: Results from the dance alignment algorithm
    """
    try:
        print(f"Processing reference file: {file1_path}")
        print(f"Processing user file: {file2_path}")
        
        # Analyze dance alignment between the two files
        alignment_results = analyze_dance_alignment(file1_path, file2_path)
        
        # Enhanced results with additional metadata
        results = {
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
        
        return results
        
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "file1_processed": False,
            "file2_processed": False
        }

# --- DANCE ALIGNMENT API ENDPOINTS ---

@app.route('/api/analyze-dance-alignment', methods=['POST'])
@jwt_required()
def analyze_dance_alignment_endpoint():
    """
    Endpoint for analyzing dance alignment between two .mot files
    Requires authentication (JWT token)
    """
    try:
        # Check if files are present in request
        if 'reference_file' not in request.files or 'user_file' not in request.files:
            return jsonify({"error": "Both reference_file and user_file are required"}), 400
        
        reference_file = request.files['reference_file']
        user_file = request.files['user_file']
        
        if reference_file.filename == '' or user_file.filename == '':
            return jsonify({"error": "Both files must have names"}), 400
        
        # Check if files are .mot files
        if not (reference_file.filename.lower().endswith('.mot') and user_file.filename.lower().endswith('.mot')):
            return jsonify({"error": "Both files must be .mot files"}), 400
        
        # Get algorithm parameters from form data
        algorithm_params = {
            'key_joint': request.form.get('key_joint', 'hip_flexion_r'),
            'frame_rate': float(request.form.get('frame_rate', 60)),
            'pose_weight': float(request.form.get('pose_weight', 0.6)),
            'timing_weight': float(request.form.get('timing_weight', 0.3)),
            'smoothness_weight': float(request.form.get('smoothness_weight', 0.1))
        }
        
        # Save uploaded files to temporary storage
        ref_path = save_uploaded_file(reference_file.read(), '.mot')
        usr_path = save_uploaded_file(user_file.read(), '.mot')
        
        # Process files with dance alignment algorithm
        results = process_two_files(ref_path, usr_path, algorithm_params)
        
        # Clean up temporary files
        cleanup_temp_files(ref_path, usr_path)
        
        return jsonify(results), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/process-dance-alignment', methods=['POST'])
@jwt_required()
def process_dance_alignment():
    """
    Alternative endpoint that accepts file paths instead of uploads
    Useful for files already stored in the system
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        ref_file_path = data.get('reference_file_path')
        usr_file_path = data.get('user_file_path')
        algorithm_params = data.get('algorithm_params', {})
        
        if not ref_file_path or not usr_file_path:
            return jsonify({"error": "Both reference_file_path and user_file_path are required"}), 400
        
        # Verify files exist
        if not os.path.exists(ref_file_path) or not os.path.exists(usr_file_path):
            return jsonify({"error": "One or both files do not exist"}), 404
        
        # Process files with dance alignment algorithm
        results = process_two_files(ref_file_path, usr_file_path, algorithm_params)
        
        return jsonify(results), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dance-alignment-status', methods=['GET'])
@jwt_required()
def get_dance_alignment_status():
    """
    Get status and information about the dance alignment algorithm
    """
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

# ================================================================================================
# END OF DANCE ALIGNMENT ALGORITHM SECTION
# ================================================================================================

# -----MEDIAPIPE INTEGRATION------
# This section uses MediaPipe Pose to extract body landmark coordinates from video frames.
# Output is a CSV with columns: frame, landmark_id, x, y, z, visibility (for downstream dance analysis).
# -----MEDIAPIPE INTEGRATION------

# Access MediaPipe's pose solution (body landmark detection).
mp_pose = mp.solutions.pose


def extract_motion_from_video(video_path, output_csv):
    """
    Read a video file, run MediaPipe Pose on each frame, and save all landmark
    coordinates (x, y, z, visibility) per frame to a CSV file.
    """
    # Open the video file for reading; cv2.VideoCapture returns a capture object.
    cap = cv2.VideoCapture(video_path)

    # Create the Pose estimator: process video (not single images), normal complexity,
    # with smoothing and confidence thresholds for detection/tracking.
    pose = mp_pose.Pose(
        static_image_mode=False,   # False = optimize for video (tracking across frames).
        model_complexity=1,        # 0=fast/light, 1=default, 2=most accurate/heavy.
        smooth_landmarks=True,     # Reduce jitter by smoothing landmark positions over time.
        min_detection_confidence=0.5,  # Minimum confidence to consider pose "detected" in a frame.
        min_tracking_confidence=0.5    # Minimum confidence to keep tracking (after initial detection).
    )

    # List to collect one row per (frame, landmark): will hold frame_num, landmark_id, x, y, z, visibility.
    data = []
    # Current frame index (1-based for readability in the CSV).
    frame_num = 0

    # Loop until the video has no more frames or the capture is closed.
    while cap.isOpened():
        # Read one frame: success=True if a frame was read, frame is the image (BGR).
        success, frame = cap.read()
        # If no frame was read (end of video or error), exit the loop.
        if not success:
            break

        # Increment frame counter so we know which frame each landmark row belongs to.
        frame_num += 1
        # MediaPipe expects RGB; OpenCV gives BGR, so convert for correct color channels.
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        # Run the pose pipeline on this frame; results contain pose_landmarks if a person was detected.
        results = pose.process(rgb)

        # Only record landmarks when at least one person was detected in this frame.
        if results.pose_landmarks:
            # idx = landmark index (0–32 in MediaPipe Pose), lm = single landmark with x, y, z, visibility.
            for idx, lm in enumerate(results.pose_landmarks.landmark):
                # Append one row: frame number, landmark id, normalized x/y/z, and visibility (0–1).
                data.append([
                    frame_num,   # Which frame this landmark came from.
                    idx,         # Which of the 33 body landmarks (e.g. nose, shoulders).
                    lm.x,        # Normalized x (0–1 relative to image width).
                    lm.y,        # Normalized y (0–1 relative to image height).
                    lm.z,        # Relative depth (smaller = closer to camera).
                    lm.visibility  # Likelihood this landmark is visible (0–1).
                ])

    # Release the video file so it is not left open.
    cap.release()
    # Free MediaPipe Pose resources (e.g. GPU/CPU buffers).
    pose.close()

    # Build a DataFrame from the list of rows for easy CSV export and later analysis.
    df = pd.DataFrame(
        data,
        columns=["frame", "landmark_id", "x", "y", "z", "visibility"]
    )
    # Write the table to CSV; index=False avoids writing row numbers as a column.
    df.to_csv(output_csv, index=False)


# -----MEDIAPIPE INTEGRATION------

# --- Run the Flask app if this file is executed directly ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

