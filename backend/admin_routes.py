from flask import jsonify, request

# import these from testing.py
from testing import app, supabase, require_auth


@app.route("/admin/users", methods=["GET"])
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


@app.route("/admin/users/<user_id>/role", methods=["PATCH"])
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


@app.route("/admin/users/<user_id>/activate", methods=["PATCH"])
@require_auth(["super_admin", "it_admin"])
def admin_activate_user(user_id):
    try:
        supabase.table("profiles").update({
            "is_active": True
        }).eq("id", user_id).execute()

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/admin/users/<user_id>/deactivate", methods=["PATCH"])
@require_auth(["super_admin", "it_admin"])
def admin_deactivate_user(user_id):
    try:
        supabase.table("profiles").update({
            "is_active": False
        }).eq("id", user_id).execute()

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500