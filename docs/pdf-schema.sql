-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create pdf_documents table to track uploaded files
CREATE TABLE IF NOT EXISTS public.pdf_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID DEFAULT auth.uid(),
  company_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  unique_url_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role full access (for API routes)
CREATE POLICY "Service role has full access" ON public.pdf_documents
  FOR ALL USING (true);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_pdf_documents_token ON public.pdf_documents(unique_url_token);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_company ON public.pdf_documents(company_name);

-- Note: You also need to create a storage bucket named 'pdf-assets' in Supabase Storage
-- Storage bucket settings:
--   - Name: pdf-assets
--   - Public: OFF (private bucket)
--   - File size limit: 50MB
--   - Allowed MIME types: application/pdf


