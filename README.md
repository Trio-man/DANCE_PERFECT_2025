# DancePerfect

DancePerfect is a web-based tool that helps dancers analyze their performance using AI. Instead of relying on expensive motion-capture gear, we use computer vision to turn standard dance videos into data-driven feedback.

The goal is to make biomechanical analysis accessible for dancers and instructors who want to see exactly what’s happening in their movement, frame by frame.

---

### What’s Under the Hood

* **Pose Estimation:** We use MediaPipe to track 33 key body landmarks in every frame of your video.


* **Kinematics:** The system automatically calculates joint angles (knees, hips, elbows, etc.) to highlight symmetry and consistency.


* **Dynamic Branding:** The app is modular; system name, logo, and brand colors are managed via a Supabase dashboard, allowing updates without code changes.


* **Modern Stack:**
* **Frontend:** Next.js (App Router) with Tailwind CSS and Framer Motion.


* **Backend:** Python/Flask running on **Hetzner Cloud** for high-performance video processing.


* **Database & Auth:** Supabase handles user logins, file storage, and CMS configurations.





---

### How It Works

1. **Upload:** Drop your performance video and a reference choreography video into the dashboard.


2. **Process:** The Flask backend analyzes both, tracking landmarks through the MediaPipe Pose pipeline.


3. **Compare:** The system computes joint angles and movement metrics.


4. **Report:** View movement trends and performance metrics directly in your browser.



---

### System Architecture

* **Frontend**: Handles user experience, auth, and displays the processed metrics.


* **Supabase**: The source of truth for user data, CMS, and app configuration.


* **Hetzner Cloud**: Hosts the Flask backend, providing the dedicated compute resources required for MediaPipe and OpenCV processing.



---

### Quick Start (Local Development)

If you’re setting this up on your machine, you’ll need to link the frontend to your Supabase and Flask instances.

**Requirements:**

* `NEXT_PUBLIC_SUPABASE_URL`: Your project URL from Supabase.
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your project's anonymous API key.

**Steps:**

1. Clone the repo: `git clone [your-repo-url]`
2. Install dependencies: `npm install`
3. Create an `.env.local` file with the keys mentioned above.
4. Run the frontend: `npm run dev`
5. Ensure your Flask backend is running on its local port.

---

### More Details

For technical details regarding production deployment, including reverse proxy configuration, process management, and automated maintenance tasks, please refer to the [INFRASTRUCTURE.md](https://www.google.com/search?q=INFRASTRUCTURE.md) file.

---

### Contributing

We’re currently focused on improving the accuracy of joint angle computation and adding more visualization types for the dashboard. If you'd like to help, feel free to open a PR!
