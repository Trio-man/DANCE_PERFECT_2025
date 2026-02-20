DancePerfect
============

DancePerfect is a web-based dance performance analysis system powered by AI-driven pose estimation and kinematic computation.

Dance evaluation is traditionally subjective and highly dependent on instructor observation. Professional motion capture systems capable of providing biomechanical data are often expensive, inaccessible, and require physical markers or specialized equipment. As a result, dancers and educators lack affordable, data-driven tools for objective performance analysis.

DancePerfect addresses this gap by leveraging MediaPipe-based markerless motion capture to extract 33-point full-body landmarks from dance videos and transform them into measurable kinematic insights. The system bridges computer vision and performance science to provide scalable, accessible, and quantitative feedback for dancers, instructors, and researchers.

---

Project Highlights
------------------

• Markerless motion capture using MediaPipe Pose  
• 33-point full-body landmark detection  
• Automated joint angle computation  
• Frame-by-frame kinematic analysis  
• Performance metric visualization dashboard  
• Admin panel for managing analysis runs  
• Built with a modern React + Vite frontend and Python backend  

---

How It Works
------------

1. A user uploads a dance performance video.
2. The backend processes each frame using MediaPipe Pose.
3. 33 body landmarks are detected per frame.
4. Joint angles and kinematic metrics are computed.
5. Processed data is stored and returned to the frontend.
6. The dashboard visualizes movement trends and performance metrics.

---

Tech Stack
----------

Frontend
- React
- Vite
- TypeScript
- Tailwind CSS

Backend
- Python
- Flask
- MediaPipe (Pose Estimation)
- OpenCV
- NumPy

Deployment
- Render (Backend)
- Vercel (Frontend)

---

System Architecture
-------------------

Client (React Frontend)
        ↓
REST API (Flask Backend)
        ↓
Video Processing Pipeline
        ↓
MediaPipe Pose Estimation
        ↓
Landmark Extraction
        ↓
Kinematic Computation
        ↓
Metric Visualization

---

Core Features
-------------

Pose Estimation  
- 33 landmark detection per frame  
- Real-time capable architecture  

Kinematic Analysis  
- Shoulder, elbow, hip, and knee angle computation  
- Symmetry analysis  
- Movement consistency tracking  
- Trajectory mapping  

Dashboard & Management  
- Analysis history tracking  
- Run management interface  
- Structured performance reporting  

---
