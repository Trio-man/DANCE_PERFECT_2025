from flask import Blueprint, request, jsonify
from services.analysis_service import compare_kinematics
import os

upload_bp = Blueprint('upload_bp', __name__)

@upload_bp.route('/upload-kinematics', methods=['POST'])
def upload_kinematics():
    ref_file = request.files.get('reference')
    user_file = request.files.get('performance')

    if not ref_file or not user_file:
        return jsonify({'error': 'Missing files'}), 400

    os.makedirs("uploads", exist_ok=True)

    ref_path = os.path.join("uploads", ref_file.filename)
    user_path = os.path.join("uploads", user_file.filename)

    ref_file.save(ref_path)
    user_file.save(user_path)

    result = compare_kinematics(ref_path, user_path)
    return jsonify(result)
