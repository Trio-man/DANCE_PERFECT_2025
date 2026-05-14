export interface DeviationMoment {
  issue: string;
  recommendation: string;

  // Main detected timestamp
  user_time?: string;

  // GIF clip range
  user_time_clip_start?: number;
  user_time_clip_end?: number;
  user_time_clip_label?: string;

  // Media
  gif_path?: string | null;
  screenshot_path?: string | null;
}

export interface AnalysisSummaries {
  where_to_improve?: string;
  what_went_well?: string;
}

export interface DeviationMomentsUI {
  run_id: string;

  practice_tips: string[];

  feedback_overview?: string;

  summaries?: AnalysisSummaries;

  deviation_moments: DeviationMoment[];
}

export interface AnalysisResponse {
  deviation_moments_ui?: DeviationMomentsUI;

  deviation_moments_ui_file?: string;
  deviation_moments_ui_file_url?: string;

  comparison?: {
    deviation_findings?: DeviationMoment[];

    practice_tips?: string[];

    summaries?: AnalysisSummaries;
  };

  deviation_gif_urls?: (string | null)[];
  deviation_comparison_image_urls?: (string | null)[];
}
