# backend.py

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import os

# Load the .env file
load_dotenv()

# Get the values from .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Debug: Check if environment variables are loaded
print(f"SUPABASE_URL loaded: {'Yes' if SUPABASE_URL else 'No'}")
print(f"SUPABASE_KEY loaded: {'Yes' if SUPABASE_KEY else 'No'}")

# Create the Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Create Flask app (only once!)
app = Flask(__name__)
CORS(app)  # Allow frontend calls

@app.route('/test-connection')
def test_connection():
    try:
        response = supabase.table("users").select("*").limit(1).execute()
        return jsonify({"data": response.data, "message": "Database connection successful"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def home():
    return "DancePerfect backend is running!"

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()  # Use get_json() instead of .json
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    email = data.get("email")
    password = data.get("password")
    
    # Debug: Print received credentials (remove this in production!)
    print(f"Received registration attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Check if user already exists
    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    # Hash the password
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Insert into Supabase
    try:
        response = supabase.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "role": "user"
        }).execute()
        
        return jsonify({"message": "User registered successfully"}), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

