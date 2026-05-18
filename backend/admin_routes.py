from flask import Blueprint, jsonify, request

# Create the Blueprint router cleanly without global testing.py imports
admin_bp = Blueprint('admin_bp', __name__)

@admin_bp.route("/admin/users", methods=["GET"])
def admin_list_users():
    # Import dynamically inside the function to eliminate circular dependencies
    from testing import supabase, require_auth
    
    @require_auth(["super_admin", "it_admin"])
    def executed_route():
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
            
    return executed_route()


@admin_bp.route("/admin/users/<user_id>/role", methods=["PATCH"])
def admin_update_role(user_id):
    from testing import supabase, require_auth
    
    @require_auth(["super_admin"])
    def executed_route(user_id):
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
            
    return executed_route(user_id)


@admin_bp.route("/admin/users/<user_id>/activate", methods=["PATCH"])
def admin_activate_user(user_id):
    from testing import supabase, require_auth
    
    @require_auth(["super_admin", "it_admin"])
    def executed_route(user_id):
        try:
            supabase.table("profiles").update({
                "is_active": True
            }).eq("id", user_id).execute()
            return jsonify({"success": True}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
            
    return executed_route(user_id)


@admin_bp.route("/admin/users/<user_id>/deactivate", methods=["PATCH"])
def admin_deactivate_user(user_id):
    from testing import supabase, require_auth
    
    @require_auth(["super_admin", "it_admin"])
    def executed_route(user_id):
        try:
            supabase.table("profiles").update({
                "is_active": False
            }).eq("id", user_id).execute()
            return jsonify({"success": True}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
            
    return executed_route(user_id)
