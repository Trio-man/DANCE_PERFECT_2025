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
# TODO: Add your computational algorithm imports here
# Examples: import numpy as np, import cv2, import pandas as pd, etc. 

# check if these are correct imports 
import tempfile
import uuid
import requests
import zipfile
import io
from pathlib import Path
import pandas as pd
import json

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
# COMPUTATIONAL ALGORITHM SECTION
# ================================================================================================
# This section is reserved for computational algorithms that process files from two sources
# Collaborators can integrate their algorithms here without affecting the authentication system
# ================================================================================================

# --- COMPUTATIONAL ALGORITHM HELPER FUNCTIONS ---
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

def fetch_mot_files_from_cloud_drive(cloud_drive_url, output_dir=None):
    """
    Fetch .mot files from a cloud drive URL (Google Drive, Dropbox, etc.)
    
    Args:
        cloud_drive_url (str): URL to the cloud drive containing .mot files
        output_dir (str): Directory to save downloaded files (optional)
    
    Returns:
        list: List of paths to downloaded .mot files
    """
    # TODO: Update this URL with your actual cloud drive link
    # Example formats:
    # Google Drive: https://drive.google.com/drive/folders/YOUR_FOLDER_ID
    # Dropbox: https://www.dropbox.com/s/YOUR_SHARE_ID
    # OneDrive: https://1drv.ms/u/s!YOUR_SHARE_ID
    
    mot_files = []
    
    try:
        # Create output directory if not provided
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="mot_files_")
        else:
            os.makedirs(output_dir, exist_ok=True)
        
        print(f"Fetching files from cloud drive: {cloud_drive_url}")
        print(f"Output directory: {output_dir}")
        
        # TODO: Replace this with actual cloud drive API calls
        # This is a placeholder implementation that demonstrates the structure
        
        # Example: For Google Drive API
        # response = requests.get(f"{cloud_drive_url}?alt=media&key=YOUR_API_KEY")
        
        # Example: For Dropbox API
        # headers = {'Authorization': f'Bearer {YOUR_ACCESS_TOKEN}'}
        # response = requests.post('https://api.dropboxapi.com/2/files/list_folder', 
        #                         headers=headers, json={'path': '/your_folder'})
        
        # Placeholder: Simulate downloading files
        # In real implementation, you would:
        # 1. Authenticate with the cloud service
        # 2. List files in the folder
        # 3. Download .mot files specifically
        # 4. Save them to the output directory
        
        print("Note: This is a placeholder implementation")
        print("Replace with actual cloud drive API integration")
        
        # Example of what the actual implementation might look like:
        """
        # For Google Drive
        drive_service = build('drive', 'v3', credentials=credentials)
        results = drive_service.files().list(
            q="mimeType='application/octet-stream' and name contains '.mot'",
            fields="nextPageToken, files(id, name)"
        ).execute()
        
        for file in results.get('files', []):
            file_path = os.path.join(output_dir, file['name'])
            request = drive_service.files().get_media(fileId=file['id'])
            with open(file_path, 'wb') as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while done is False:
                    status, done = downloader.next_chunk()
            mot_files.append(file_path)
        """
        
        # For now, return empty list - collaborators will implement actual fetching
        return mot_files
        
    except Exception as e:
        print(f"Error fetching files from cloud drive: {e}")
        return []

def read_mot_file_pandas(file_path):
    """Read a .mot file and return it as a pandas DataFrame."""
    with open(file_path) as f:
        lines = f.readlines()
    # Find where the 'time' header starts
    start_index = next(i for i, line in enumerate(lines) if line.strip().startswith("time"))
    # Read file from 'time' line onward
    df = pd.read_csv(file_path, sep=r'\s+', skiprows=start_index)
    return df

def check_sync(file1, file2, tolerance=0.001):
    """Check if two .mot files are synchronized based on their time columns."""
    df1 = read_mot_file_pandas(file1)
    df2 = read_mot_file_pandas(file2)

    t1 = df1['time']
    t2 = df2['time']

    # Exact match check
    if t1.equals(t2):
        result = {
            "synced": True,
            "message": "✅ Files are perfectly synchronized.",
            "time_diff": 0.0
        }
    else:
        # Measure differences
        start_diff = abs(t1.iloc[0] - t2.iloc[0])
        end_diff = abs(t1.iloc[-1] - t2.iloc[-1])
        sampling_diff = abs((t1[1] - t1[0]) - (t2[1] - t2[0]))

        synced = all(diff < tolerance for diff in [start_diff, end_diff, sampling_diff])

        result = {
            "synced": synced,
            "start_diff": start_diff,
            "end_diff": end_diff,
            "sampling_diff": sampling_diff,
            "message": "✅ Files are effectively synced within tolerance."
            if synced else "⚠️ Files are NOT synchronized."
        }

    return result

def align_mot_files(file1, file2, output_path="aligned_file2.mot"):
    """Interpolate file2 to match file1's time base if unsynced."""
    df1 = read_mot_file_pandas(file1)
    df2 = read_mot_file_pandas(file2)

    df2_interp = df2.set_index('time').reindex(df1['time']).interpolate().reset_index()
    df2_interp.to_csv(output_path, sep='\t', index=False)
    print(f"✅ File '{file2}' aligned to '{file1}' and saved as '{output_path}'.")

def read_mot_file(file_path, use_pandas=False):
    """
    Read and parse a .mot file into structured data for comparison
    
    Args:
        file_path (str): Path to the .mot file
        use_pandas (bool): If True, use pandas for faster reading (returns DataFrame)
    
    Returns:
        dict or DataFrame: Parsed .mot file data with structured frames and joints, or pandas DataFrame if use_pandas=True
    """
    if use_pandas:
        return read_mot_file_pandas(file_path)
    try:
        print(f"Reading .mot file: {file_path}")
        
        mot_data = {
            "file_path": file_path,
            "file_name": os.path.basename(file_path),
            "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
            "header": {},
            "frames": [],
            "joint_data": {},
            "timestamps": [],
            "text_representation": [],
            "metadata": {
                "format": "mot",
                "version": "unknown",
                "frame_count": 0,
                "joint_count": 0,
                "has_timestamps": False
            }
        }
        
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                
                print(f"File contains {len(lines)} lines")
                
                # Parse .mot file structure
                frame_start_line = 0
                joint_names = []
                
                # Look for header information and column names
                for i, line in enumerate(lines):
                    line = line.strip()
                    
                    if not line or line.startswith('#'):
                        continue
                    
                    # Check if this looks like a header with joint names
                    if 'time' in line.lower() or any(joint in line.lower() for joint in ['hip', 'knee', 'ankle', 'shoulder', 'elbow', 'wrist']):
                        # This is likely the header line with joint names
                        joint_names = line.split()
                        mot_data["header"]["joint_names"] = joint_names
                        mot_data["metadata"]["joint_count"] = len(joint_names) - 1  # Subtract time column
                        frame_start_line = i + 1
                        break
                
                # Parse frame data
                for i in range(frame_start_line, len(lines)):
                    line = lines[i].strip()
                    
                    if not line or line.startswith('#'):
                        continue
                    
                    # Split the line into values
                    values = line.split()
                    
                    if len(values) < 2:  # Skip lines with insufficient data
                        continue
                    
                    # Extract timestamp (usually first column)
                    try:
                        timestamp = float(values[0])
                        mot_data["timestamps"].append(timestamp)
                        mot_data["metadata"]["has_timestamps"] = True
                    except ValueError:
                        timestamp = i - frame_start_line  # Use line number as fallback
                        mot_data["timestamps"].append(timestamp)
                    
                    # Extract joint data (remaining columns)
                    frame_data = {
                        "frame_number": i - frame_start_line,
                        "timestamp": timestamp,
                        "joint_values": [],
                        "raw_line": line
                    }
                    
                    # Parse joint values
                    for j in range(1, len(values)):
                        try:
                            joint_value = float(values[j])
                            frame_data["joint_values"].append(joint_value)
                        except ValueError:
                            frame_data["joint_values"].append(0.0)  # Default value
                    
                    mot_data["frames"].append(frame_data)
                
                # Organize joint data by joint name
                if joint_names:
                    for i, joint_name in enumerate(joint_names[1:], 1):  # Skip time column
                        mot_data["joint_data"][joint_name] = []
                        for frame in mot_data["frames"]:
                            if i-1 < len(frame["joint_values"]):
                                mot_data["joint_data"][joint_name].append(frame["joint_values"][i-1])
                
                # Create text representation for easy reading
                mot_data["text_representation"] = create_text_representation(mot_data)
                
                mot_data["metadata"]["frame_count"] = len(mot_data["frames"])
                
                print(f"Successfully parsed {mot_data['metadata']['frame_count']} frames with {mot_data['metadata']['joint_count']} joints")
        
        return mot_data
        
    except Exception as e:
        print(f"Error reading .mot file {file_path}: {e}")
        return {"error": str(e), "file_path": file_path}

def create_text_representation(mot_data):
    """
    Convert parsed .mot data into computer-optimized format for computational analysis
    
    Args:
        mot_data (dict): Parsed .mot file data
    
    Returns:
        dict: Structured data optimized for computational processing
    """
    # Computer-friendly structured format
    computational_data = {
        "file_metadata": {
            "filename": mot_data['file_name'],
            "frame_count": mot_data['metadata']['frame_count'],
            "joint_count": mot_data['metadata']['joint_count'],
            "file_size_bytes": mot_data['file_size'],
            "has_timestamps": mot_data['metadata']['has_timestamps'],
            "joint_names": mot_data.get("header", {}).get("joint_names", [])
        },
        "frame_data": {
            "timestamps": [frame['timestamp'] for frame in mot_data['frames']],
            "joint_matrices": [],  # 2D array: frames x joints
            "frame_numbers": [frame['frame_number'] for frame in mot_data['frames']]
        },
        "joint_statistics": {},
        "motion_metrics": {
            "total_duration": 0.0,
            "frame_rate": 0.0,
            "motion_variance": {},
            "motion_range": {},
            "motion_velocity": {}
        },
        "computational_vectors": {}  # Pre-computed vectors for algorithms
    }
    
    # Create joint matrix (frames x joints) for efficient computation
    if mot_data['frames'] and mot_data['frames'][0]['joint_values']:
        num_joints = len(mot_data['frames'][0]['joint_values'])
        computational_data["frame_data"]["joint_matrices"] = [
            frame['joint_values'] for frame in mot_data['frames']
        ]
        
        # Transpose for joint-wise analysis (joints x frames)
        joint_wise_data = list(zip(*computational_data["frame_data"]["joint_matrices"]))
        
        # Calculate comprehensive joint statistics
        for i, (joint_name, values) in enumerate(mot_data["joint_data"].items()):
            if values and i < len(joint_wise_data):
                joint_values = joint_wise_data[i]
                
                # Basic statistics
                min_val = min(values)
                max_val = max(values)
                mean_val = sum(values) / len(values)
                variance = sum((x - mean_val) ** 2 for x in values) / len(values)
                std_dev = variance ** 0.5
                
                # Motion metrics
                velocity = [abs(values[i+1] - values[i]) for i in range(len(values)-1)]
                avg_velocity = sum(velocity) / len(velocity) if velocity else 0
                max_velocity = max(velocity) if velocity else 0
                
                computational_data["joint_statistics"][joint_name] = {
                    "min": min_val,
                    "max": max_val,
                    "mean": mean_val,
                    "variance": variance,
                    "std_dev": std_dev,
                    "range": max_val - min_val,
                    "data_points": len(values)
                }
                
                computational_data["motion_metrics"]["motion_variance"][joint_name] = variance
                computational_data["motion_metrics"]["motion_range"][joint_name] = max_val - min_val
                computational_data["motion_metrics"]["motion_velocity"][joint_name] = {
                    "avg_velocity": avg_velocity,
                    "max_velocity": max_velocity,
                    "velocity_variance": sum((v - avg_velocity) ** 2 for v in velocity) / len(velocity) if velocity else 0
                }
    
    # Calculate temporal metrics
    if computational_data["frame_data"]["timestamps"]:
        timestamps = computational_data["frame_data"]["timestamps"]
        computational_data["motion_metrics"]["total_duration"] = max(timestamps) - min(timestamps)
        if len(timestamps) > 1:
            computational_data["motion_metrics"]["frame_rate"] = len(timestamps) / computational_data["motion_metrics"]["total_duration"]
    
    # Create computational vectors for algorithm processing
    computational_data["computational_vectors"] = {
        "all_joint_values": [val for joint_values in computational_data["frame_data"]["joint_matrices"] for val in joint_values],
        "joint_means": [computational_data["joint_statistics"][joint]["mean"] for joint in computational_data["joint_statistics"]],
        "joint_ranges": [computational_data["joint_statistics"][joint]["range"] for joint in computational_data["joint_statistics"]],
        "motion_intensity": [sum(abs(v) for v in joint_values) for joint_values in computational_data["frame_data"]["joint_matrices"]],
        "frame_variance": [sum((val - mean) ** 2 for val, mean in zip(frame_values, computational_data["joint_statistics"].values())) / len(frame_values) 
                          for frame_values in computational_data["frame_data"]["joint_matrices"]]
    }
    
    return computational_data

def compare_mot_files(mot_data1, mot_data2):
    """
    Compare two parsed .mot files with computational analysis optimized for algorithms
    
    Args:
        mot_data1 (dict): First .mot file data
        mot_data2 (dict): Second .mot file data
    
    Returns:
        dict: Computational comparison results for algorithm processing
    """
    # Get computational representations
    comp_data1 = mot_data1.get("text_representation", {})
    comp_data2 = mot_data2.get("text_representation", {})
    
    comparison = {
        "file_metadata": {
            "file1_name": mot_data1.get("file_name", "Unknown"),
            "file2_name": mot_data2.get("file_name", "Unknown"),
            "file1_frames": mot_data1.get("metadata", {}).get("frame_count", 0),
            "file2_frames": mot_data2.get("metadata", {}).get("frame_count", 0),
            "file1_joints": mot_data1.get("metadata", {}).get("joint_count", 0),
            "file2_joints": mot_data2.get("metadata", {}).get("joint_count", 0)
        },
        "structural_comparison": {
            "frame_count_difference": abs(mot_data1.get("metadata", {}).get("frame_count", 0) - mot_data2.get("metadata", {}).get("frame_count", 0)),
            "joint_count_difference": abs(mot_data1.get("metadata", {}).get("joint_count", 0) - mot_data2.get("metadata", {}).get("joint_count", 0))
        },
        "motion_analysis": {
            "duration_comparison": {
                "file1_duration": comp_data1.get("motion_metrics", {}).get("total_duration", 0),
                "file2_duration": comp_data2.get("motion_metrics", {}).get("total_duration", 0),
                "duration_ratio": 0.0
            },
            "frame_rate_comparison": {
                "file1_fps": comp_data1.get("motion_metrics", {}).get("frame_rate", 0),
                "file2_fps": comp_data2.get("motion_metrics", {}).get("frame_rate", 0),
                "fps_difference": 0.0
            }
        },
        "joint_analysis": {
            "common_joints": [],
            "unique_joints": {"file1": [], "file2": []},
            "joint_similarity_scores": {},
            "motion_correlation": {}
        },
        "computational_metrics": {
            "euclidean_distance": 0.0,
            "cosine_similarity": 0.0,
            "motion_intensity_difference": 0.0,
            "variance_correlation": 0.0
        },
        "algorithm_ready_data": {
            "feature_vectors": {},
            "normalized_matrices": {},
            "comparison_matrices": {}
        }
    }
    
    # Calculate duration ratio
    if comparison["motion_analysis"]["duration_comparison"]["file2_duration"] > 0:
        comparison["motion_analysis"]["duration_comparison"]["duration_ratio"] = (
            comparison["motion_analysis"]["duration_comparison"]["file1_duration"] / 
            comparison["motion_analysis"]["duration_comparison"]["file2_duration"]
        )
    
    # Calculate FPS difference
    comparison["motion_analysis"]["frame_rate_comparison"]["fps_difference"] = abs(
        comparison["motion_analysis"]["frame_rate_comparison"]["file1_fps"] - 
        comparison["motion_analysis"]["frame_rate_comparison"]["file2_fps"]
    )
    
    # Analyze joint overlap and differences
    joints1 = set(mot_data1.get("joint_data", {}).keys())
    joints2 = set(mot_data2.get("joint_data", {}).keys())
    
    common_joints = joints1.intersection(joints2)
    unique_to_file1 = joints1 - joints2
    unique_to_file2 = joints2 - joints1
    
    comparison["joint_analysis"]["common_joints"] = list(common_joints)
    comparison["joint_analysis"]["unique_joints"]["file1"] = list(unique_to_file1)
    comparison["joint_analysis"]["unique_joints"]["file2"] = list(unique_to_file2)
    
    # Calculate computational metrics for common joints
    if common_joints:
        joint_similarities = []
        motion_correlations = []
        
        for joint in common_joints:
            values1 = mot_data1["joint_data"][joint]
            values2 = mot_data2["joint_data"][joint]
            
            if values1 and values2:
                # Calculate mean squared difference (lower = more similar)
                mse = sum((a - b) ** 2 for a, b in zip(values1, values2)) / len(values1)
                similarity_score = 1.0 / (1.0 + mse)  # Convert to similarity (0-1)
                
                # Calculate correlation coefficient
                mean1, mean2 = sum(values1)/len(values1), sum(values2)/len(values2)
                numerator = sum((a - mean1) * (b - mean2) for a, b in zip(values1, values2))
                denominator = (sum((a - mean1) ** 2 for a in values1) * sum((b - mean2) ** 2 for b in values2)) ** 0.5
                correlation = numerator / denominator if denominator != 0 else 0
                
                comparison["joint_analysis"]["joint_similarity_scores"][joint] = {
                    "similarity_score": similarity_score,
                    "mse": mse,
                    "correlation": correlation
                }
                
                joint_similarities.append(similarity_score)
                motion_correlations.append(abs(correlation))
        
        # Overall similarity metrics
        if joint_similarities:
            comparison["computational_metrics"]["euclidean_distance"] = sum(joint_similarities) / len(joint_similarities)
            comparison["computational_metrics"]["motion_correlation"] = sum(motion_correlations) / len(motion_correlations)
    
    # Calculate cosine similarity using computational vectors
    if comp_data1.get("computational_vectors") and comp_data2.get("computational_vectors"):
        vec1 = comp_data1["computational_vectors"].get("joint_means", [])
        vec2 = comp_data2["computational_vectors"].get("joint_means", [])
        
        if vec1 and vec2:
            # Pad shorter vector with zeros
            max_len = max(len(vec1), len(vec2))
            vec1_padded = vec1 + [0] * (max_len - len(vec1))
            vec2_padded = vec2 + [0] * (max_len - len(vec2))
            
            # Calculate cosine similarity
            dot_product = sum(a * b for a, b in zip(vec1_padded, vec2_padded))
            magnitude1 = sum(a ** 2 for a in vec1_padded) ** 0.5
            magnitude2 = sum(b ** 2 for b in vec2_padded) ** 0.5
            
            if magnitude1 > 0 and magnitude2 > 0:
                comparison["computational_metrics"]["cosine_similarity"] = dot_product / (magnitude1 * magnitude2)
    
    # Motion intensity comparison
    intensity1 = comp_data1.get("computational_vectors", {}).get("motion_intensity", [])
    intensity2 = comp_data2.get("computational_vectors", {}).get("motion_intensity", [])
    
    if intensity1 and intensity2:
        avg_intensity1 = sum(intensity1) / len(intensity1)
        avg_intensity2 = sum(intensity2) / len(intensity2)
        comparison["computational_metrics"]["motion_intensity_difference"] = abs(avg_intensity1 - avg_intensity2)
    
    # Prepare algorithm-ready data
    comparison["algorithm_ready_data"] = {
        "feature_vectors": {
            "file1": comp_data1.get("computational_vectors", {}),
            "file2": comp_data2.get("computational_vectors", {})
        },
        "normalized_matrices": {
            "file1": comp_data1.get("frame_data", {}).get("joint_matrices", []),
            "file2": comp_data2.get("frame_data", {}).get("joint_matrices", [])
        },
        "comparison_matrices": {
            "joint_similarities": comparison["joint_analysis"]["joint_similarity_scores"],
            "motion_metrics": {
                "file1": comp_data1.get("motion_metrics", {}),
                "file2": comp_data2.get("motion_metrics", {})
            }
        }
    }
    
    return comparison

# --- COMPUTATIONAL ALGORITHM CORE FUNCTION ---
def process_two_files(file1_path, file2_path, algorithm_params=None):
    """
    Main computational algorithm function that processes two files
    
    Args:
        file1_path (str): Path to the first file
        file2_path (str): Path to the second file
        algorithm_params (dict): Optional parameters for the algorithm
    
    Returns:
        dict: Results from the computational algorithm
    """
    # TODO: Replace this with your actual computational algorithm
    # This is a placeholder that demonstrates the structure
    
    try:
        print(f"Processing file 1: {file1_path}")
        print(f"Processing file 2: {file2_path}")
        
        # ================================================================================================
        # CLOUD DRIVE FILE FETCHING AND .MOT FILE PROCESSING
        # ================================================================================================
        
        # TODO: Update this URL with your actual cloud drive link
        cloud_drive_url = "https://your-cloud-drive-url-here.com/folder"
        
        # Fetch .mot files from cloud drive
        print("Fetching .mot files from cloud drive...")
        mot_files = fetch_mot_files_from_cloud_drive(cloud_drive_url)
        
        if not mot_files:
            print("No .mot files found in cloud drive or error occurred")
            # Fall back to processing the provided files
            mot_files = [file1_path, file2_path]
        
        print(f"Found {len(mot_files)} .mot files to process")
        
        # Process each .mot file
        processed_mot_data = []
        for mot_file_path in mot_files:
            print(f"Reading .mot file: {mot_file_path}")
            mot_data = read_mot_file(mot_file_path)
            
            if "error" not in mot_data:
                processed_mot_data.append(mot_data)
                print(f"Successfully processed .mot file: {mot_file_path}")
            else:
                print(f"Error processing .mot file: {mot_file_path}")
        
        # Compare .mot files if we have exactly 2 files
        comparison_results = None
        if len(processed_mot_data) == 2:
            print("Comparing two .mot files...")
            comparison_results = compare_mot_files(processed_mot_data[0], processed_mot_data[1])
            print("Comparison completed!")
        elif len(processed_mot_data) > 2:
            print(f"Found {len(processed_mot_data)} .mot files - comparing first two")
            comparison_results = compare_mot_files(processed_mot_data[0], processed_mot_data[1])
        
        # TODO: Add your computational algorithm here
        # Example: Compare motion data, calculate similarity scores, etc.
        
        # Enhanced algorithm processing using the .mot file data and comparison
        algorithm_results = {
            "similarity_score": 0.85,
            "processing_time": "2.3s",
            "confidence": "high",
            "mot_files_processed": len(processed_mot_data),
            "total_frames_analyzed": sum(data["metadata"]["frame_count"] for data in processed_mot_data),
            "joint_analysis": {
                "joint_count": max(data["metadata"]["joint_count"] for data in processed_mot_data) if processed_mot_data else 0,
                "movement_patterns": ["pattern1", "pattern2", "pattern3"]  # Example
            },
            "file_comparison": comparison_results
        }
        
        # ================================================================================================
        # END OF CLOUD DRIVE AND .MOT FILE PROCESSING
        # ================================================================================================
        
        results = {
            "status": "success",
            "file1_processed": True,
            "file2_processed": True,
            "mot_files_from_cloud": len(mot_files),
            "algorithm_results": algorithm_results,
            "processed_mot_data": processed_mot_data,
            "output_files": [],  # List of generated output files
            "metadata": {
                "algorithm_version": "1.0",
                "timestamp": "2025-01-01T12:00:00Z",
                "cloud_drive_url": cloud_drive_url
            }
        }
        
        return results
        
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "file1_processed": False,
            "file2_processed": False,
            "mot_files_from_cloud": 0
        }

# --- COMPUTATIONAL ALGORITHM API ENDPOINTS ---

@app.route('/api/upload-files', methods=['POST'])
@jwt_required()
def upload_files():
    """
    Endpoint for uploading two files for computational processing
    Requires authentication (JWT token)
    """
    try:
        # Check if files are present in request
        if 'file1' not in request.files or 'file2' not in request.files:
            return jsonify({"error": "Both file1 and file2 are required"}), 400
        
        file1 = request.files['file1']
        file2 = request.files['file2']
        
        if file1.filename == '' or file2.filename == '':
            return jsonify({"error": "Both files must have names"}), 400
        
        # Get algorithm parameters from form data
        algorithm_params = {
            'sensitivity': request.form.get('sensitivity', 'medium'),
            'output_format': request.form.get('output_format', 'json'),
            # Add more parameters as needed
        }
        
        # Save uploaded files to temporary storage
        file1_path = save_uploaded_file(file1.read(), os.path.splitext(file1.filename)[1])
        file2_path = save_uploaded_file(file2.read(), os.path.splitext(file2.filename)[1])
        
        # Process files with computational algorithm
        results = process_two_files(file1_path, file2_path, algorithm_params)
        
        # Clean up temporary files
        cleanup_temp_files(file1_path, file2_path)
        
        return jsonify(results), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/process-algorithm', methods=['POST'])
@jwt_required()
def process_algorithm():
    """
    Alternative endpoint that accepts file paths instead of uploads
    Useful for files already stored in the system
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        file1_path = data.get('file1_path')
        file2_path = data.get('file2_path')
        algorithm_params = data.get('algorithm_params', {})
        
        if not file1_path or not file2_path:
            return jsonify({"error": "Both file1_path and file2_path are required"}), 400
        
        # Verify files exist
        if not os.path.exists(file1_path) or not os.path.exists(file2_path):
            return jsonify({"error": "One or both files do not exist"}), 404
        
        # Process files with computational algorithm
        results = process_two_files(file1_path, file2_path, algorithm_params)
        
        return jsonify(results), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/algorithm-status', methods=['GET'])
@jwt_required()
def get_algorithm_status():
    """
    Get status and information about available algorithms
    """
    return jsonify({
        "available_algorithms": [
            {
                "name": "Dance Analysis Algorithm",
                "version": "1.0",
                "description": "Analyzes dance performance from video files",
                "supported_formats": [".mp4", ".avi", ".mov", ".mot"],
                "parameters": ["sensitivity", "output_format"]
            },
            {
                "name": "MOT File Synchronization",
                "version": "1.0",
                "description": "Checks synchronization and aligns .mot files",
                "supported_formats": [".mot"],
                "parameters": ["tolerance", "align"],
                "endpoints": ["/api/sync-mot-files"]
            }
        ],
        "system_status": "operational"
    }), 200

@app.route('/api/sync-mot-files', methods=['POST'])
@jwt_required()
def sync_mot_files_endpoint():
    """
    Endpoint for checking synchronization and aligning .mot files
    Returns synchronization status and optionally creates aligned files
    """
    try:
        # Check if files are present in request
        if 'file1' not in request.files or 'file2' not in request.files:
            return jsonify({"error": "Both file1 and file2 are required for synchronization"}), 400
        
        file1 = request.files['file1']
        file2 = request.files['file2']
        
        if file1.filename == '' or file2.filename == '':
            return jsonify({"error": "Both files must have names"}), 400
        
        # Check if files are .mot files
        if not (file1.filename.lower().endswith('.mot') and file2.filename.lower().endswith('.mot')):
            return jsonify({"error": "Both files must be .mot files"}), 400
        
        # Get tolerance parameter from form data
        tolerance = float(request.form.get('tolerance', 0.001))
        align_files = request.form.get('align', 'false').lower() == 'true'
        
        # Save uploaded files to temporary storage
        file1_path = save_uploaded_file(file1.read(), '.mot')
        file2_path = save_uploaded_file(file2.read(), '.mot')
        
        # Check synchronization
        sync_result = check_sync(file1_path, file2_path, tolerance)
        
        result = {
            "status": "success",
            "sync_check": sync_result,
            "files": {
                "file1": file1.filename,
                "file2": file2.filename
            },
            "tolerance_used": tolerance
        }
        
        # Align files if requested and not synced
        if align_files and not sync_result["synced"]:
            aligned_path = os.path.join(tempfile.gettempdir(), f"aligned_{file2.filename}")
            align_mot_files(file1_path, file2_path, aligned_path)
            result["aligned_file"] = {
                "path": aligned_path,
                "filename": f"aligned_{file2.filename}",
                "message": "File has been aligned and saved"
            }
        
        # Clean up temporary files
        cleanup_temp_files(file1_path, file2_path)
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/compare-mot-files', methods=['POST'])
@jwt_required()
def compare_mot_files_endpoint():
    """
    Endpoint specifically for comparing two .mot files
    Returns detailed comparison results in text format
    """
    try:
        # Check if files are present in request
        if 'file1' not in request.files or 'file2' not in request.files:
            return jsonify({"error": "Both file1 and file2 are required for comparison"}), 400
        
        file1 = request.files['file1']
        file2 = request.files['file2']
        
        if file1.filename == '' or file2.filename == '':
            return jsonify({"error": "Both files must have names"}), 400
        
        # Check if files are .mot files
        if not (file1.filename.lower().endswith('.mot') and file2.filename.lower().endswith('.mot')):
            return jsonify({"error": "Both files must be .mot files"}), 400
        
        # Save uploaded files to temporary storage
        file1_path = save_uploaded_file(file1.read(), '.mot')
        file2_path = save_uploaded_file(file2.read(), '.mot')
        
        # Read and parse both .mot files
        print(f"Reading first .mot file: {file1_path}")
        mot_data1 = read_mot_file(file1_path)
        
        print(f"Reading second .mot file: {file2_path}")
        mot_data2 = read_mot_file(file2_path)
        
        # Check for parsing errors
        if "error" in mot_data1:
            cleanup_temp_files(file1_path, file2_path)
            return jsonify({"error": f"Error parsing first file: {mot_data1['error']}"}), 400
        
        if "error" in mot_data2:
            cleanup_temp_files(file1_path, file2_path)
            return jsonify({"error": f"Error parsing second file: {mot_data2['error']}"}), 400
        
        # Compare the two .mot files
        comparison_results = compare_mot_files(mot_data1, mot_data2)
        
        # Create computational comparison report optimized for algorithms
        comparison_report = {
            "computational_summary": {
                "file1_name": mot_data1["file_name"],
                "file2_name": mot_data2["file_name"],
                "comparison_timestamp": "2025-01-01T12:00:00Z",
                "processing_metadata": {
                    "algorithm_version": "2.0",
                    "data_format": "computational_optimized"
                }
            },
            "computational_data": {
                "file1_processed": mot_data1["text_representation"],
                "file2_processed": mot_data2["text_representation"],
                "comparison_analysis": comparison_results
            },
            "algorithm_metrics": {
                "overall_similarity": comparison_results.get("computational_metrics", {}).get("euclidean_distance", 0),
                "motion_correlation": comparison_results.get("computational_metrics", {}).get("motion_correlation", 0),
                "cosine_similarity": comparison_results.get("computational_metrics", {}).get("cosine_similarity", 0),
                "motion_intensity_diff": comparison_results.get("computational_metrics", {}).get("motion_intensity_difference", 0),
                "structural_compatibility": {
                    "frame_ratio": comparison_results.get("motion_analysis", {}).get("duration_comparison", {}).get("duration_ratio", 0),
                    "joint_overlap": len(comparison_results.get("joint_analysis", {}).get("common_joints", [])),
                    "fps_difference": comparison_results.get("motion_analysis", {}).get("frame_rate_comparison", {}).get("fps_difference", 0)
                }
            },
            "feature_vectors": comparison_results.get("algorithm_ready_data", {}).get("feature_vectors", {}),
            "comparison_matrices": comparison_results.get("algorithm_ready_data", {}).get("comparison_matrices", {}),
            "joint_analysis": comparison_results.get("joint_analysis", {}),
            "computational_vectors": {
                "file1": mot_data1["text_representation"].get("computational_vectors", {}),
                "file2": mot_data2["text_representation"].get("computational_vectors", {})
            }
        }
        
        # Clean up temporary files
        cleanup_temp_files(file1_path, file2_path)
        
        return jsonify({
            "status": "success",
            "message": "MOT files processed for computational analysis",
            "results": comparison_report,
            "algorithm_ready": True,
            "data_format": "computational_optimized"
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ================================================================================================
# END OF COMPUTATIONAL ALGORITHM SECTION
# ================================================================================================

# --- Run the Flask app if this file is executed directly ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

