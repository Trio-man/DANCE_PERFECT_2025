from flask import jsonify, request

from backend.services.analysis_service import compare_kinematics


@upload_bp.route('/upload-kinematics', methods=['POST']) # type: ignore
def upload_kinematics():
    ref_file = request.files.get('reference')
    user_file = request.files.get('performance')

    if not ref_file or not user_file:
        return jsonify({'error': 'Missing files'}), 400

    # Save to temp
    ref_path = f"uploads/{ref_file.filename}"
    user_path = f"uploads/{user_file.filename}"
    ref_file.save(ref_path)
    user_file.save(user_path)

    result = compare_kinematics(ref_path, user_path)
    return jsonify(result)
