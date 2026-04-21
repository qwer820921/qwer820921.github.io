export interface EmailParticipant {
  address: string;
  name: string;
}

export interface EmailMessage {
  id: string;
  from: string | EmailParticipant;
  subject: string;
  body?: string;
  text?: string;
  html?: string;
  intro?: string;
  date: string;
  createdAt?: string;
}

export interface CreateResponse {
  success: boolean;
  email: string;
  expires_in: number;
  message?: string;
}

export interface CheckResponse {
  success: boolean;
  message?: string;
  inbox: EmailMessage[];
}
