export interface InspectionItem {
  id: string;
  timestamp: string;
  prediction: 'Defective' | 'Non-defective';
  defect_type: string;
  confidence: number;
  notes?: string;
  image_url?: string;
  is_placeholder?: boolean;
  user_id?: string | null;
  user_email?: string | null;
}

export interface ClassificationResponse {
  prediction: 'Defective' | 'Non-defective';
  defect_type: string;
  confidence: number;
  is_placeholder: boolean;
  boxes?: Array<{
    label: string;
    conf: number;
    box: [number, number, number, number];
  }>;
  timestamp?: string;
  error?: string;
}

export type CameraErrorType = 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'GeneralError' | null;

export interface SystemStats {
  total_checked: number;
  good_count: number;
  defect_count: number;
  defect_rate: number;
  fps: number;
  status: string;
  source: string;
  conf_threshold: number;
  conveyor_delay: number;
  last_defect: { id: string; type: string; conf: number; time: string } | null;
  defect_breakdown: Record<string, number>;
}
