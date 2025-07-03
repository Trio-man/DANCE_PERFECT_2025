# backend.py

########## START OF supabase connection #########

from supabase import create_client
from dotenv import load_dotenv
import os

# Load the .env file
load_dotenv()

# Get the values from .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Create the Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/test-connection')
def test_connection():
    response = supabase.table("users").select("*").limit(1).execute()
    return jsonify(response.data)

# flask server starter code
from flask import Flask

app = Flask(__name__)

#checker if its working, go on website local host 127.0.0.1.... soimething something 
@app.route('/')
def home():
    return "DancePerfect backend is running!"

if __name__ == '__main__':
    app.run(debug=True)

####### END OF SUPABASE CONNECTION ######

# import flask_cors and bcrypt
# bcrypt is for password hashing
# flash_cors is for front to backend communication

from flask import request, jsonify
from flask_cors import CORS
import bcrypt

CORS(app)  # Allow frontend calls

######### START OF BCRYPT CODE BLOCK ########


@app.route('/register', methods=['POST'])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Check if user already exists
    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    # Hash the password
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Insert into Supabase
    response = supabase.table("users").insert({
        "email": email,
        "password_hash": password_hash,
        "role": "user"
    }).execute()

    if response.error:
        return jsonify({"error": response.error.message}), 500

    return jsonify({"message": "User registered successfully"}), 201

