import { ObjectId } from 'mongodb';

export interface User {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  role: 'lawyer' | 'admin';
  org_id: string;
}

export interface Matter {
  _id?: ObjectId;
  org_id: string;
  name: string;
  client_name: string;
  status: 'active' | 'archived' | 'pending';
  created_at: Date;
}

export interface DocumentRecord {
  _id?: ObjectId;
  org_id: string;
  matter_id: ObjectId;
  name: string;
  s3_key: string;
  status: 'processing' | 'completed' | 'failed';
  file_size: number;
  raw_text?: string;
  page_count?: number;
  created_at: Date;
}

export interface Clause {
  _id?: ObjectId;
  org_id: string;
  document_id: ObjectId;
  matter_id: ObjectId;
  category: string; // e.g. "Termination", "Liability", etc.
  raw_text: string;
  page_number: number;
  created_at: Date;
}

export interface Obligation {
  _id?: ObjectId;
  org_id: string;
  document_id: ObjectId;
  matter_id: ObjectId;
  raw_text: string;
  due_date?: Date;
  status: 'pending' | 'completed' | 'overdue';
  created_at: Date;
}

export interface Risk {
  _id?: ObjectId;
  org_id: string;
  matter_id: ObjectId;
  clause_id?: ObjectId;
  risk_level: 'high' | 'medium' | 'low';
  description: string;
  explanation: string;
  trust_score: number;
  created_at: Date;
}

export interface TimelineReport {
  _id?: ObjectId;
  org_id: string;
  matter_id: ObjectId;
  report_text: string;
  events: Array<{
    title: string;
    date: Date;
    type: 'deadline' | 'renewal' | 'expiration' | 'notice' | 'payment';
    description: string;
  }>;
  created_at: Date;
}
