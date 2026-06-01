# DancePerfect

DancePerfect is a web-based platform that helps dancers analyze their performance using artificial intelligence and computer vision. Instead of relying on expensive motion-capture equipment, the system transforms standard dance videos into data-driven biomechanical feedback.

The goal is to make movement analysis more accessible to dancers and instructors by providing detailed insights into performance, symmetry, and movement quality on a frame-by-frame basis.

---

## Features

### Pose Estimation

DancePerfect uses MediaPipe Pose to track 33 key body landmarks throughout a performance video, enabling markerless motion capture without specialized hardware.

### Kinematic Analysis

The system automatically computes joint angles and movement metrics, including:

* Knee angles
* Hip angles
* Elbow angles
* Shoulder angles
* Symmetry measurements
* Movement consistency metrics

### Dynamic Branding

The platform supports dynamic branding through a Supabase-powered configuration system. Administrators can update:

* System name
* Logo
* Brand colors

without requiring code changes or redeployment.

### Technology Stack

#### Frontend

* Next.js (App Router)
* Tailwind CSS
* Framer Motion
* Vercel Deployment

#### Backend

* Python
* Flask
* MediaPipe
* OpenCV
* Hetzner Cloud Hosting

#### Database and Authentication

* Supabase Database
* Supabase Authentication
* Supabase Storage
* CMS Configuration Management

---

## How It Works

### 1. Upload

Users upload:

* A dance performance video
* A reference choreography video

through the web dashboard.

### 2. Process

The Flask backend processes both videos using the MediaPipe Pose pipeline and extracts body landmarks from each frame.

### 3. Compare

The system calculates joint angles and movement metrics to analyze biomechanical performance and identify similarities or differences between performances.

### 4. Report

Results are presented through an interactive dashboard where users can review movement trends, performance metrics, and comparative analyses.

---

## System Architecture

### Frontend

Responsible for:

* User interface and user experience
* Authentication workflows
* File uploads
* Data visualization and reporting

### Supabase

Serves as the central platform for:

* User management
* Authentication
* File storage
* CMS configuration
* Application settings

### Backend

The Flask backend handles:

* Video processing
* Pose estimation
* Kinematic calculations
* Analysis generation

The backend is hosted on Hetzner Cloud to provide the computational resources required for MediaPipe and OpenCV workloads.

---

## Quick Start

### Prerequisites

Before running the project locally, ensure you have:

* Node.js 18 or later
* npm
* A Supabase project
* A running Flask backend instance

### Environment Variables

Create an `.env.local` file in the project root and add the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd danceperfect
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Ensure the Flask backend is running and accessible from the frontend application.

Open your browser and navigate to:

```text
http://localhost:3000
```

---

## Project Structure

```text
Frontend (Next.js)
        │
        ▼
    Supabase
(Auth, Storage, CMS)
        │
        ▼
Backend (Flask)
(MediaPipe, OpenCV)
        │
        ▼
 Hetzner Cloud
```

---

## Additional Documentation

For technical details regarding production deployment, infrastructure configuration, process management, reverse proxy setup, and automated maintenance tasks, refer to:

```text
INFRASTRUCTURE.md
```

---

## Academic Context

DancePerfect was developed as a thesis project focused on applying markerless motion capture and biomechanical analysis to dance performance evaluation.

The platform aims to provide an accessible alternative to traditional motion-capture systems while delivering meaningful movement insights for dancers, instructors, and researchers.
