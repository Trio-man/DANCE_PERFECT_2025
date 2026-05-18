from flask import Blueprint, jsonify, request

# 1. Create a Blueprint router (replaces 'app')
admin_bp = Blueprint('admin_bp', __name__)

# 2. Only import what you actually need from testing.py (no more 'app' loop!)
from testing import supabase, require_auth

# 3. Swap out @app.route for @admin_bp.route
@admin_bp.route("/admin/users", methods=["GET"])
@require_auth(["super_admin", "it_admin"])
def admin_list_users():
    try:
        resp = (
            supabase.table("profiles")
            .select("id,email,role,is_active,created_at")
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify({"users": resp.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/admin/users/<user_id>/role", methods=["PATCH"])
@require_auth(["super_admin"])
def admin_update_role(user_id):
    try:
        data = request.get_json()
        role = data.get("role")
        if role not in ["user", "it_admin", "super_admin"]:
            return jsonify({"error": "Invalid role"}), 400

        supabase.table("profiles").update({
            "role": role
        }).eq("id", user_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/admin/users/<user_id>/activate", methods=["PATCH"])
@require_auth(["super_admin", "it_admin"])
def admin_activate_user(user_id):
    try:
        supabase.table("profiles").update({
            "is_active": True
        }).eq("id", user_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/admin/users/<user_id>/deactivate", methods=["PATCH"])
@require_auth(["super_admin", "it_admin"])
def admin_deactivate_user(user_id):
    try:
        supabase.table("profiles").update({
            "is_active": False
        }).eq("id", user_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
