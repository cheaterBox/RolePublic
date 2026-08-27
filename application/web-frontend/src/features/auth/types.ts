export interface UserSummary {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: UserSummary;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}
