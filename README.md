# DancePerfect

DancePerfect is a web-based dance performance analysis platform that uses computer vision and artificial intelligence to generate biomechanical feedback from standard dance videos. By leveraging MediaPipe Pose and kinematic analysis, the system provides dancers and instructors with data-driven insights into movement quality, symmetry, and performance consistency.

## Features

* Markerless motion capture using MediaPipe Pose
* Tracking of 33 body landmarks
* Automatic joint angle and kinematic analysis
* Performance comparison against a reference choreography
* Dynamic branding and CMS configuration through Supabase
* Role-Based Access Control (RBAC) with dedicated admin management features

## Technology Stack

### Frontend

* Next.js (App Router)
* Tailwind CSS
* Framer Motion
* Vercel

### Backend

* Python
* Flask
* MediaPipe
* OpenCV
* Hetzner Cloud

### Database & Authentication

* Supabase

## How It Works

1. Upload a performance video and a reference choreography video.
2. The backend extracts body landmarks using MediaPipe Pose.
3. Joint angles and movement metrics are calculated.
4. Results are displayed through an interactive dashboard.

## Quick Start

### Prerequisites

* Node.js 18+
* npm
* Supabase project
* Flask backend instance

### Environment Variables

Create an `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

```

### Installation

```bash
git clone <your-repository-url>
cd danceperfect
npm install
npm run dev

```

Ensure the Flask backend is running before starting the frontend application.

## Documentation

For production deployment, infrastructure configuration, reverse proxy setup, process management, and maintenance procedures, see:

```text
INFRASTRUCTURE.md

```

## Academic Context

DancePerfect was developed as a thesis project focused on applying markerless motion capture and biomechanical analysis to dance performance evaluation.
