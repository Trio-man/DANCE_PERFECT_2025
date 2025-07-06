# backend.py

# --- Imports: Flask for web server, CORS for cross-origin, Supabase for DB, dotenv for env vars, bcrypt for hashing, os for env access ---
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import os

# --- Load environment variables from .env file ---
load_dotenv()

# --- Retrieve Supabase credentials from environment variables ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- Debug: Print if environment variables are loaded (remove in production) ---
print(f"SUPABASE_URL loaded: {'Yes' if SUPABASE_URL else 'No'}")
print(f"SUPABASE_KEY loaded: {'Yes' if SUPABASE_KEY else 'No'}")

# --- Initialize Supabase client for database operations ---
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Create Flask app and enable CORS for frontend-backend communication ---
app = Flask(__name__)
CORS(app)  # Allow frontend calls

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

# --- Run the Flask app if this file is executed directly ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

